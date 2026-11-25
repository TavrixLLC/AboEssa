import { HttpStatus } from '@nestjs/common';
import { ActorType, InventoryMovementType, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AppException } from 'src/common/exceptions/app.exception';

export type InventoryTx = Prisma.TransactionClient;
export const inventoryError = (
  code: string,
  message = code,
  status = HttpStatus.CONFLICT,
): never => {
  throw new AppException(message, code, status);
};
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
export const inventoryHash = (body: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(body)))
    .digest('hex');
export const inventoryRetryable = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === 'P2034' ||
    (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))));

/** Only uses the caller's transaction. No I/O, new transaction or management flag. */
export class InventoryLedger {
  static async lockProduct(tx: InventoryTx, id: string) {
    await tx.$queryRaw`SELECT id FROM "ProductListing" WHERE id=${id} FOR UPDATE`;
    const product = await tx.productListing.findUnique({ where: { id } });
    if (!product) inventoryError('PRODUCT_NOT_FOUND', 'Product was not found', 404);
    return product!;
  }

  static async operation(
    tx: InventoryTx,
    scope: string,
    key: string,
    kind: string,
    body: unknown,
    actorType: ActorType,
    actorId?: string,
    meta?: { reason?: string; reference?: string; notes?: string },
  ) {
    if (!key?.trim() || key.length > 160)
      inventoryError('IDEMPOTENCY_KEY_REQUIRED', 'A key of 1–160 characters is required', 400);
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${scope + '/' + key},0))) q`;
    const requestHash = inventoryHash({ kind, body });
    const prior = await tx.inventoryOperation.findUnique({ where: { scope_key: { scope, key } } });
    if (prior) {
      if (prior.requestHash !== requestHash) inventoryError('IDEMPOTENCY_CONFLICT');
      return { operation: prior, replayed: true };
    }
    return {
      operation: await tx.inventoryOperation.create({
        data: {
          scope,
          key,
          kind,
          requestHash,
          actorType,
          actorId,
          reason: meta?.reason,
          reference: meta?.reference,
          notes: meta?.notes,
        },
      }),
      replayed: false,
    };
  }

  static finish(tx: InventoryTx, id: string, outcome: unknown) {
    return tx.inventoryOperation.update({
      where: { id },
      data: { outcome: JSON.parse(JSON.stringify(outcome)) as Prisma.InputJsonValue },
    });
  }

  static async change(
    tx: InventoryTx,
    productId: string,
    locationId: string,
    operationId: string,
    movementType: InventoryMovementType,
    quantityDelta: number,
    reservedDelta = 0,
    referenceType?: string,
    referenceId?: string,
  ) {
    const location = await tx.warehouseLocation.findUniqueOrThrow({
      where: { id: locationId },
      include: { warehouse: true },
    });
    const before = await tx.inventoryBalance.upsert({
      where: { productId_locationId: { productId, locationId } },
      create: { productId, locationId },
      update: {},
    });
    const onHand = before.quantityOnHand + quantityDelta,
      reserved = before.quantityReserved + reservedDelta;
    if (
      onHand < 0 ||
      reserved < 0 ||
      reserved > onHand ||
      !Number.isSafeInteger(onHand) ||
      onHand > 2147483647
    )
      inventoryError('INSUFFICIENT_LOCATION_STOCK');
    await tx.inventoryBalance.update({
      where: { id: before.id },
      data: { quantityOnHand: onHand, quantityReserved: reserved },
    });
    return tx.inventoryMovement.create({
      data: {
        productId,
        locationId,
        operationId,
        movementType,
        quantityDelta,
        quantityBefore: before.quantityOnHand,
        quantityAfter: onHand,
        reservedDelta,
        reservedBefore: before.quantityReserved,
        reservedAfter: reserved,
        warehouseCode: location.warehouse.code,
        locationCode: location.code,
        referenceType,
        referenceId,
      },
    });
  }

  static async reserve(
    tx: InventoryTx,
    product: { id: string; inventoryMappedAt?: Date | null },
    items: { id: string; orderId: string; quantity: number }[],
    customerId: string,
  ) {
    if (!product.inventoryMappedAt) return;
    const orderId = items[0].orderId;
    const op = await this.operation(
      tx,
      `ORDER:${orderId}`,
      'RESERVE',
      'RESERVATION',
      { productId: product.id, items: items.map((i) => [i.id, i.quantity]).sort() },
      ActorType.CUSTOMER,
      customerId,
    );
    if (op.replayed) return;
    const balances = await tx.inventoryBalance.findMany({
      where: { productId: product.id },
      include: { location: { include: { warehouse: true } } },
    });
    balances.sort(
      (a, b) =>
        Number(a.location.isSystem) - Number(b.location.isSystem) ||
        a.location.warehouse.code.localeCompare(b.location.warehouse.code) ||
        a.location.sortOrder - b.location.sortOrder ||
        a.location.code.localeCompare(b.location.code) ||
        a.id.localeCompare(b.id),
    );
    for (const item of items) {
      let left = item.quantity;
      for (const balance of balances) {
        if (!balance.location.isActive || !balance.location.warehouse.isActive) continue;
        const count = Math.min(left, balance.quantityOnHand - balance.quantityReserved);
        if (count <= 0) continue;
        await tx.inventoryAllocation.create({
          data: {
            productId: product.id,
            orderItemId: item.id,
            locationId: balance.locationId,
            quantity: count,
          },
        });
        await this.change(
          tx,
          product.id,
          balance.locationId,
          op.operation.id,
          'RESERVATION',
          0,
          count,
          'Order',
          orderId,
        );
        balance.quantityReserved += count;
        left -= count;
        if (!left) break;
      }
      if (left) inventoryError('INVENTORY_ALLOCATION_FAILED');
    }
    await this.finish(tx, op.operation.id, { orderId, itemIds: items.map((i) => i.id) });
  }

  static async settleItems(
    tx: InventoryTx,
    items: { id: string; productListingId: string | null; quantity: number }[],
    reference: string,
    action: 'SHIP' | 'REVERSE',
    actorId: string,
    referenceType: 'Order' | 'ShipmentRequest' = 'Order',
  ) {
    const productIds = [
      ...new Set(items.flatMap((i) => (i.productListingId ? [i.productListingId] : []))),
    ].sort();
    for (const productId of productIds) {
      const product = await this.lockProduct(tx, productId);
      if (!product.inventoryMappedAt) continue;
      const selected = items.filter((i) => i.productListingId === productId);
      const op = await this.operation(
        tx,
        `${action}:${reference}`,
        productId,
        action,
        { itemIds: selected.map((i) => i.id).sort() },
        ActorType.ADMIN,
        actorId,
      );
      if (op.replayed) continue;
      const allocations = await tx.inventoryAllocation.findMany({
        where: { productId, orderItemId: { in: selected.map((i) => i.id) }, status: 'RESERVED' },
        orderBy: { id: 'asc' },
      });
      const expected = selected.reduce((n, i) => n + i.quantity, 0);
      if (allocations.reduce((n, a) => n + a.quantity, 0) !== expected)
        inventoryError('INVENTORY_ALLOCATION_MISSING');
      for (const allocation of allocations) {
        await this.change(
          tx,
          productId,
          allocation.locationId,
          op.operation.id,
          action === 'SHIP' ? 'SALE' : 'SALE_REVERSAL',
          action === 'SHIP' ? -allocation.quantity : 0,
          -allocation.quantity,
          referenceType,
          reference,
        );
        await tx.inventoryAllocation.update({
          where: { id: allocation.id },
          data: { status: action === 'SHIP' ? 'SHIPPED' : 'REVERSED' },
        });
      }
      await this.finish(tx, op.operation.id, { reference, quantity: expected });
    }
  }
}
