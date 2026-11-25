import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType, InventoryMovementType, Prisma, ProductListingStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { SocketsService } from 'src/sockets/sockets.service';
import { normalizedCatalogText } from 'src/catalog/catalog.service';
import {
  InventoryLedger as L,
  InventoryTx,
  inventoryError as fail,
  inventoryRetryable,
} from './inventory-ledger';
import {
  AdjustStockDto,
  InventoryBackfillDto,
  InventoryQueryDto,
  LocationWriteDto,
  StockInDto,
  TransferStockDto,
  WarehouseWriteDto,
} from './inventory.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly sockets: SocketsService,
  ) {}
  assertEnabled() {
    if (this.config.get<boolean>('inventory.managementEnabled') !== true)
      fail('INVENTORY_DISABLED', 'Inventory management is disabled', 404);
  }
  private code(raw?: string) {
    const value = raw?.trim().toUpperCase();
    if (
      !value ||
      !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(value) ||
      value.startsWith('SYS_') ||
      value === 'UNALLOCATED_LEGACY'
    )
      fail('INVALID_LOCATION_CODE', 'Use a unique physical code, e.g. A-01', 400);
    return value!;
  }
  private name(raw?: string) {
    const value = raw?.trim();
    if (!value) fail('NAME_REQUIRED', 'Name is required', 400);
    return value!;
  }
  async transaction<T>(run: (tx: InventoryTx) => Promise<T>) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(run, {
          isolationLevel: 'Serializable',
          timeout: 20000,
          maxWait: 10000,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (inventoryRetryable(error) && attempt < 3) {
            await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
            continue;
          }
          if (inventoryRetryable(error)) fail('INVENTORY_CONFLICT_RETRY');
          if (error.code === 'P2002')
            fail('INVENTORY_DUPLICATE_CODE', 'Code or operation already exists');
          if (error.code === 'P2025')
            fail('INVENTORY_NOT_FOUND', 'Inventory record not found', 404);
        }
        throw error;
      }
    }
  }
  private async audit(
    tx: InventoryTx,
    actorId: string,
    action: string,
    entityId: string,
    data: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        actorType: 'ADMIN',
        actorId,
        action,
        entityType: 'Inventory',
        entityId,
        metadata: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
      },
    });
  }
  async warehouses(q: InventoryQueryDto) {
    const where: Prisma.WarehouseWhereInput = {
      isSystem: false,
      ...(q.activeOnly === 'true' ? { isActive: true } : {}),
      ...(q.search
        ? {
            OR: [
              { code: { contains: q.search, mode: 'insensitive' } },
              { name: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.warehouse.findMany({
        where,
        include: { _count: { select: { locations: true } } },
        orderBy: { code: 'asc' },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.warehouse.count({ where }),
    ]);
    return {
      items,
      meta: { page: q.page, limit: q.limit, total, hasMore: q.page * q.limit < total },
    };
  }
  async warehouse(id: string) {
    return this.db.warehouse.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { locations: true } } },
    });
  }
  async writeWarehouse(id: string | undefined, dto: WarehouseWriteDto, actorId: string) {
    return this.transaction(async (tx) => {
      if (id) {
        await tx.$queryRaw`SELECT id FROM "Warehouse" WHERE id=${id} FOR UPDATE`;
        const current = await tx.warehouse.findUniqueOrThrow({ where: { id } });
        if (current.isSystem) fail('SYSTEM_LOCATION_IMMUTABLE');
        if (
          dto.isActive === false &&
          (await tx.inventoryBalance.count({
            where: { location: { warehouseId: id }, quantityOnHand: { gt: 0 } },
          }))
        )
          fail('WAREHOUSE_NOT_EMPTY');
      }
      const data = {
        ...(dto.code !== undefined ? { code: this.code(dto.code) } : {}),
        ...(dto.name !== undefined ? { name: this.name(dto.name) } : {}),
        description: dto.description?.trim(),
        isActive: dto.isActive,
      };
      const row = id
        ? await tx.warehouse.update({ where: { id }, data })
        : await tx.warehouse.create({
            data: { ...data, code: this.code(dto.code), name: this.name(dto.name) },
          });
      await this.audit(tx, actorId, id ? 'warehouse.updated' : 'warehouse.created', row.id, data);
      return row;
    });
  }
  async locations(q: InventoryQueryDto) {
    const where: Prisma.WarehouseLocationWhereInput = {
      warehouseId: q.warehouseId,
      ...(q.activeOnly === 'true' ? { isActive: true, warehouse: { isActive: true } } : {}),
      ...(q.physicalOnly === 'true'
        ? { isSystem: false, warehouse: { isActive: true, isSystem: false } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { code: { contains: q.search.trim(), mode: 'insensitive' } },
              { name: { contains: q.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.warehouseLocation.findMany({
        where,
        include: { warehouse: true, _count: { select: { balances: true } } },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }, { id: 'asc' }],
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.warehouseLocation.count({ where }),
    ]);
    return {
      items,
      meta: { page: q.page, limit: q.limit, total, hasMore: q.page * q.limit < total },
    };
  }
  location(id: string) {
    return this.db.warehouseLocation.findUniqueOrThrow({
      where: { id },
      include: { warehouse: true },
    });
  }
  async writeLocation(id: string | undefined, dto: LocationWriteDto, actorId: string) {
    return this.transaction(async (tx) => {
      const current = id ? await tx.warehouseLocation.findUniqueOrThrow({ where: { id } }) : null;
      const warehouseId = current?.warehouseId ?? dto.warehouseId;
      if (!warehouseId) fail('WAREHOUSE_REQUIRED', 'Warehouse selection is required', 400);
      await tx.$queryRaw`SELECT id FROM "Warehouse" WHERE id=${warehouseId} FOR SHARE`;
      const warehouse = await tx.warehouse.findUniqueOrThrow({ where: { id: warehouseId! } });
      if (warehouse.isSystem || !warehouse.isActive) fail('WAREHOUSE_INACTIVE');
      if (current?.isSystem) fail('SYSTEM_LOCATION_IMMUTABLE');
      if (current && dto.warehouseId && dto.warehouseId !== current.warehouseId)
        fail('LOCATION_WAREHOUSE_IMMUTABLE');
      if (id) {
        await tx.$queryRaw`SELECT id FROM "WarehouseLocation" WHERE id=${id} FOR UPDATE`;
        if (
          dto.isActive === false &&
          (await tx.inventoryBalance.count({
            where: { locationId: id, quantityOnHand: { gt: 0 } },
          }))
        )
          fail('LOCATION_NOT_EMPTY');
      }
      let parent = dto.parentId;
      const visited = new Set(id ? [id] : []);
      while (parent) {
        if (visited.has(parent)) fail('LOCATION_HIERARCHY_CYCLE');
        visited.add(parent);
        const p = await tx.warehouseLocation.findUniqueOrThrow({ where: { id: parent } });
        if (p.warehouseId !== warehouseId) fail('LOCATION_PARENT_WAREHOUSE_MISMATCH');
        parent = p.parentId;
      }
      const data = {
        ...(dto.code !== undefined ? { code: this.code(dto.code) } : {}),
        ...(dto.name !== undefined ? { name: this.name(dto.name) } : {}),
        description: dto.description?.trim(),
        isActive: dto.isActive,
        parentId: dto.parentId,
        type: dto.type,
        sortOrder: dto.sortOrder,
      };
      const row = id
        ? await tx.warehouseLocation.update({ where: { id }, data })
        : await tx.warehouseLocation.create({
            data: {
              ...data,
              warehouseId: warehouseId!,
              code: this.code(dto.code),
              name: this.name(dto.name),
            },
          });
      await this.audit(
        tx,
        actorId,
        id ? 'warehouse.location.updated' : 'warehouse.location.created',
        row.id,
        data,
      );
      return row;
    });
  }
  private async physical(tx: InventoryTx, id: string, allowSystem = false) {
    const original = await tx.warehouseLocation.findUniqueOrThrow({ where: { id } });
    await tx.$queryRaw`SELECT id FROM "Warehouse" WHERE id=${original.warehouseId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "WarehouseLocation" WHERE id=${id} FOR SHARE`;
    const row = await tx.warehouseLocation.findUniqueOrThrow({
      where: { id },
      include: { warehouse: true },
    });
    if (!row.isActive || !row.warehouse.isActive) fail('LOCATION_INACTIVE');
    if (!allowSystem && (row.isSystem || row.warehouse.isSystem))
      fail('PHYSICAL_LOCATION_REQUIRED');
    return row;
  }
  async productInventory(id: string, client: InventoryTx | PrismaService = this.db) {
    // A read-only report must not mix product/balance/ledger commits.
    if (client === this.db)
      return this.db.$transaction((tx) => this.snapshotInventory(id, tx), {
        isolationLevel: 'RepeatableRead',
      });
    return this.snapshotInventory(id, client);
  }
  private async snapshotInventory(id: string, client: InventoryTx | PrismaService) {
    const product = await client.productListing.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        title: true,
        imageUrls: true,
        totalQuantity: true,
        availableQuantity: true,
        soldQuantity: true,
        status: true,
        inventoryMappedAt: true,
      },
    });
    const balances = await client.inventoryBalance.findMany({
      where: { productId: id },
      include: { location: { include: { warehouse: true } } },
      orderBy: { locationId: 'asc' },
    });
    const onHand = balances.reduce((n, b) => n + b.quantityOnHand, 0),
      reserved = balances.reduce((n, b) => n + b.quantityReserved, 0);
    const ledger = await client.inventoryMovement.aggregate({
      where: { productId: id },
      _sum: { quantityDelta: true, reservedDelta: true },
    });
    const allocations = await client.inventoryAllocation.aggregate({
      where: { productId: id, status: 'RESERVED' },
      _sum: { quantity: true },
    });
    const ledgerByLocation = await client.inventoryMovement.groupBy({
      by: ['locationId'],
      where: { productId: id },
      _sum: { quantityDelta: true, reservedDelta: true },
    });
    const allocationsByLocation = await client.inventoryAllocation.groupBy({
      by: ['locationId'],
      where: { productId: id, status: 'RESERVED' },
      _sum: { quantity: true },
    });
    const byId = new Map(balances.map((b) => [b.locationId, b]));
    const locationDifferences = [
      ...new Set([
        ...byId.keys(),
        ...ledgerByLocation.map((l) => l.locationId),
        ...allocationsByLocation.map((a) => a.locationId),
      ]),
    ].flatMap((locationId) => {
      const b = byId.get(locationId),
        l = ledgerByLocation.find((v) => v.locationId === locationId),
        a = allocationsByLocation.find((v) => v.locationId === locationId);
      const ledgerOnHandDifference = (b?.quantityOnHand ?? 0) - (l?._sum.quantityDelta ?? 0);
      const ledgerReservedDifference = (b?.quantityReserved ?? 0) - (l?._sum.reservedDelta ?? 0);
      const allocationDifference = (b?.quantityReserved ?? 0) - (a?._sum.quantity ?? 0);
      return ledgerOnHandDifference || ledgerReservedDifference || allocationDifference
        ? [{ locationId, ledgerOnHandDifference, ledgerReservedDifference, allocationDifference }]
        : [];
    });
    const invalid =
      product.availableQuantity < 0 ||
      product.soldQuantity < 0 ||
      product.totalQuantity !== product.availableQuantity + product.soldQuantity;
    const mismatch =
      locationDifferences.length > 0 ||
      onHand - reserved !== product.availableQuantity ||
      reserved !== (allocations._sum.quantity ?? 0) ||
      onHand !== (ledger._sum.quantityDelta ?? 0) ||
      reserved !== (ledger._sum.reservedDelta ?? 0);
    const state = invalid
      ? 'INVALID_QUANTITY'
      : !product.inventoryMappedAt
        ? 'MIGRATION_PENDING'
        : mismatch
          ? 'MISMATCH'
          : balances.some((b) => b.location.isSystem && b.quantityOnHand > 0)
            ? 'UNALLOCATED'
            : 'MATCHED';
    return {
      product,
      balances,
      totals: {
        quantityOnHand: onHand,
        quantityReserved: reserved,
        availableQuantity: product.availableQuantity,
        mappedAvailable: onHand - reserved,
      },
      reconciliation: {
        state,
        difference: onHand - reserved - product.availableQuantity,
        locationDifferences,
        ledgerOnHand: ledger._sum.quantityDelta ?? 0,
        ledgerReserved: ledger._sum.reservedDelta ?? 0,
      },
    };
  }
  async products(q: InventoryQueryDto) {
    const search = normalizedCatalogText(q.search ?? '').replace(/[\\%_]/g, '\\$&');
    const where = Prisma.sql`(${search}='' OR catalog_search(p.title) LIKE ${'%' + search + '%'} OR p.id=${q.search ?? ''})
      AND (${q.locationId ?? null}::text IS NULL OR EXISTS(SELECT 1 FROM "InventoryBalance" b WHERE b."productId"=p.id AND b."locationId"=${q.locationId ?? null}))`;
    const rows = await this.db.$queryRaw<
      {
        id: string;
        title: string;
        categoryId: string;
        categoryName: string;
        imageUrls: string[];
        availableQuantity: number;
        totalQuantity: number;
        inventoryMappedAt: Date | null;
        status: string;
      }[]
    >`
      SELECT p.id,p.title,p."categoryId",c.name AS "categoryName",p."imageUrls",p."availableQuantity",p."totalQuantity",p."inventoryMappedAt",p.status FROM "ProductListing" p JOIN "Category" c ON c.id=p."categoryId" WHERE ${where} ORDER BY p."createdAt" DESC,p.id DESC LIMIT ${q.limit + 1} OFFSET ${(q.page - 1) * q.limit}`;
    return {
      items: rows.slice(0, q.limit),
      meta: { page: q.page, limit: q.limit, hasMore: rows.length > q.limit },
    };
  }
  async reconciliation(q: InventoryQueryDto) {
    const page = await this.products(q);
    return {
      ...page,
      items: await Promise.all(page.items.map((p) => this.productInventory(p.id))),
    };
  }
  async movements(productId: string, q: InventoryQueryDto) {
    await this.db.productListing.findUniqueOrThrow({
      where: { id: productId },
      select: { id: true },
    });
    const items = await this.db.inventoryMovement.findMany({
      where: {
        productId,
        locationId: q.locationId,
        movementType: q.movementType as InventoryMovementType | undefined,
      },
      include: { operation: true, product: { select: { id: true, title: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      skip: (q.page - 1) * q.limit,
    });
    return {
      items: items.slice(0, q.limit),
      meta: { page: q.page, limit: q.limit, hasMore: items.length > q.limit },
    };
  }
  private async requireMapped(tx: InventoryTx, id: string, allowZero = false) {
    const product = await L.lockProduct(tx, id);
    if (!product.inventoryMappedAt) {
      if (
        !allowZero ||
        product.availableQuantity !== 0 ||
        (await tx.orderItem.count({
          where: { productListingId: id, status: { notIn: ['SHIPPED', 'DELIVERED', 'CANCELLED'] } },
        }))
      )
        fail('INVENTORY_MIGRATION_REQUIRED');
      await this.map(tx, id, 'SYSTEM');
    }
    const snapshot = await this.productInventory(id, tx);
    if (['MISMATCH', 'INVALID_QUANTITY'].includes(snapshot.reconciliation.state))
      fail('INVENTORY_RECONCILIATION_REQUIRED');
    return product;
  }
  private availabilityStatus(
    product: { status: ProductListingStatus; availableQuantity: number },
    delta: number,
  ) {
    const available = product.availableQuantity + delta;
    if (product.status === 'SOLD' && available > 0) return ProductListingStatus.ACTIVE;
    if (product.status === 'ACTIVE' && available === 0) return ProductListingStatus.SOLD;
    return product.status; // Never publish a deliberately DRAFT/CANCELLED listing.
  }
  async stockIn(id: string, dto: StockInDto, actorId: string, key: string) {
    const result = await this.transaction((tx) =>
      this.stockInInTransaction(tx, id, dto, actorId, key),
    );
    this.changed(id, 'stock_in', actorId);
    return result;
  }
  /** No independent commit or socket I/O: intake shares the same trusted stock core. */
  async stockInInTransaction(
    tx: InventoryTx,
    id: string,
    dto: StockInDto,
    actorId: string,
    key: string,
    initial = false,
  ) {
    if (!Number.isInteger(dto.quantity) || dto.quantity < 1 || dto.quantity > 1000000)
      fail('INVALID_QUANTITY', 'Quantity must be a positive bounded integer', 400);
    const op = await L.operation(
      tx,
      `ADMIN:${actorId}`,
      key,
      initial ? 'INITIAL_STOCK' : 'STOCK_IN',
      { productId: id, ...dto },
      'ADMIN',
      actorId,
      dto,
    );
    if (op.replayed) return op.operation.outcome;
    const product = await this.requireMapped(tx, id, true);
    if (
      initial &&
      (product.totalQuantity !== 0 ||
        (await tx.inventoryMovement.count({ where: { productId: id } })))
    )
      fail('INITIAL_STOCK_ALREADY_EXISTS');
    if (product.totalQuantity + dto.quantity > 2147483647)
      fail('INVENTORY_QUANTITY_LIMIT', 'Lifetime quantity exceeds the integer limit', 400);
    await this.physical(tx, dto.locationId);
    const movement = await L.change(
      tx,
      id,
      dto.locationId,
      op.operation.id,
      initial ? 'OPENING_BALANCE' : 'STOCK_IN',
      dto.quantity,
    );
    await tx.productListing.update({
      where: { id },
      data: {
        availableQuantity: { increment: dto.quantity },
        totalQuantity: { increment: dto.quantity },
        status: this.availabilityStatus(product, dto.quantity),
      },
    });
    const outcome = {
      addedQuantity: dto.quantity,
      movementId: movement.id,
      ...(await this.productInventory(id, tx)),
    };
    await L.finish(tx, op.operation.id, outcome);
    return outcome;
  }
  async adjust(id: string, dto: AdjustStockDto, actorId: string, key: string) {
    if (!dto.quantityDelta || !dto.reason.trim())
      fail('ADJUSTMENT_REASON_REQUIRED', 'Nonzero adjustment and reason required', 400);
    const result = await this.transaction(async (tx) => {
      const op = await L.operation(
        tx,
        `ADMIN:${actorId}`,
        key,
        'ADJUSTMENT',
        { productId: id, ...dto },
        'ADMIN',
        actorId,
        dto,
      );
      if (op.replayed) return op.operation.outcome;
      const product = await this.requireMapped(tx, id);
      if (product.totalQuantity + dto.quantityDelta > 2147483647)
        fail('INVENTORY_QUANTITY_LIMIT', 'Lifetime quantity exceeds the integer limit', 400);
      await this.physical(tx, dto.locationId);
      const movement = await L.change(
        tx,
        id,
        dto.locationId,
        op.operation.id,
        dto.quantityDelta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        dto.quantityDelta,
      );
      await tx.productListing.update({
        where: { id },
        data: {
          availableQuantity: { increment: dto.quantityDelta },
          totalQuantity: { increment: dto.quantityDelta },
          status: this.availabilityStatus(product, dto.quantityDelta),
        },
      });
      const outcome = { movementId: movement.id, ...(await this.productInventory(id, tx)) };
      await L.finish(tx, op.operation.id, outcome);
      return outcome;
    });
    this.changed(id, 'adjustment', actorId);
    return result;
  }
  async transfer(dto: TransferStockDto, actorId: string, key: string) {
    if (dto.sourceLocationId === dto.destinationLocationId)
      fail('TRANSFER_LOCATIONS_IDENTICAL', 'Choose distinct locations', 400);
    const result = await this.transaction(async (tx) => {
      const op = await L.operation(
        tx,
        `ADMIN:${actorId}`,
        key,
        'TRANSFER',
        dto,
        'ADMIN',
        actorId,
        dto,
      );
      if (op.replayed) return op.operation.outcome;
      await this.requireMapped(tx, dto.productId);
      // Stable location/warehouse lock ordering also permits safe reverse transfers.
      for (const id of [dto.sourceLocationId, dto.destinationLocationId].sort())
        await this.physical(tx, id, id === dto.sourceLocationId);
      await L.change(
        tx,
        dto.productId,
        dto.sourceLocationId,
        op.operation.id,
        'TRANSFER_OUT',
        -dto.quantity,
        0,
        'Transfer',
        op.operation.id,
      );
      await L.change(
        tx,
        dto.productId,
        dto.destinationLocationId,
        op.operation.id,
        'TRANSFER_IN',
        dto.quantity,
        0,
        'Transfer',
        op.operation.id,
      );
      const outcome = {
        transferId: op.operation.id,
        ...(await this.productInventory(dto.productId, tx)),
      };
      await L.finish(tx, op.operation.id, outcome);
      return outcome;
    });
    this.changed(dto.productId, 'transfer', actorId);
    return result;
  }
  changed(id: string, kind: string, actorId: string) {
    // Acknowledgement may be an idempotent replay; never log secrets or request bodies.
    this.logger.log(
      JSON.stringify({ event: 'inventory.operation_acknowledged', productId: id, kind, actorId }),
    );
    this.sockets.emitToAdmins('catalog_changed', { family: 'products', id });
    this.sockets.emitToCustomers('catalog_changed', { family: 'products', id });
  }
  private async legacyPending(
    tx: InventoryTx,
    product: { id: string; availableQuantity: number; soldQuantity: number; totalQuantity: number },
  ) {
    if (
      product.availableQuantity < 0 ||
      product.soldQuantity < 0 ||
      product.totalQuantity !== product.availableQuantity + product.soldQuantity
    )
      fail('INVALID_LEGACY_QUANTITY');
    const pending = await tx.orderItem.findMany({
      where: {
        productListingId: product.id,
        status: { notIn: ['SHIPPED', 'DELIVERED', 'CANCELLED'] },
      },
      orderBy: { id: 'asc' },
    });
    if (pending.some((i) => i.quantity !== 1) || pending.length > product.soldQuantity)
      fail('LEGACY_HISTORY_REVIEW_REQUIRED');
    return pending;
  }
  private async map(tx: InventoryTx, id: string, actorId: string) {
    const product = await L.lockProduct(tx, id);
    if (product.inventoryMappedAt) return { productId: id, alreadyMapped: true };
    const pending = await this.legacyPending(tx, product);
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended('inventory-system-location',0))) q`;
    const warehouse = await tx.warehouse.upsert({
      where: { code: 'SYS_LEGACY' },
      create: { code: 'SYS_LEGACY', name: 'Legacy unallocated accounting', isSystem: true },
      update: {},
    });
    const location = await tx.warehouseLocation.upsert({
      where: { warehouseId_code: { warehouseId: warehouse.id, code: 'UNALLOCATED_LEGACY' } },
      create: {
        warehouseId: warehouse.id,
        code: 'UNALLOCATED_LEGACY',
        name: 'مخزون قديم غير موزع — ليس رفاً فعلياً',
        isSystem: true,
      },
      update: {},
    });
    const op = await L.operation(
      tx,
      `BACKFILL:${id}`,
      'OPENING',
      'OPENING_BALANCE',
      { available: product.availableQuantity, reserved: pending.length },
      ActorType.SYSTEM,
      actorId,
    );
    if (op.replayed) fail('BACKFILL_STATE_CONFLICT');
    const balance = await L.change(
      tx,
      id,
      location.id,
      op.operation.id,
      'OPENING_BALANCE',
      product.availableQuantity + pending.length,
      pending.length,
      'ProductListing',
      id,
    );
    for (const item of pending)
      await tx.inventoryAllocation.create({
        data: { productId: id, orderItemId: item.id, locationId: location.id, quantity: 1 },
      });
    await tx.productListing.update({ where: { id }, data: { inventoryMappedAt: new Date() } });
    const outcome = {
      productId: id,
      sourceAvailableQuantity: product.availableQuantity,
      sourcePendingQuantity: pending.length,
      openingMovementId: balance.id,
    };
    await L.finish(tx, op.operation.id, outcome);
    return outcome;
  }
  async backfill(dto: InventoryBackfillDto, actorId: string) {
    const products = await this.db.productListing.findMany({
      where: { id: dto.productId ?? (dto.afterId ? { gt: dto.afterId } : undefined) },
      orderBy: { id: 'asc' },
      take: dto.productId ? 1 : dto.limit,
    });
    if (dto.productId && !products.length) fail('PRODUCT_NOT_FOUND', 'Product was not found', 404);
    const results: unknown[] = [];
    for (const product of products) {
      try {
        if (dto.dryRun) {
          results.push(
            await this.db.$transaction(
              async (tx) => {
                const before = await this.snapshotInventory(product.id, tx);
                const pending = before.product.inventoryMappedAt
                  ? []
                  : await this.legacyPending(tx, before.product);
                return {
                  productId: product.id,
                  dryRun: true,
                  ...before.reconciliation,
                  alreadyMapped: !!before.product.inventoryMappedAt,
                  available: before.product.availableQuantity,
                  sourcePendingQuantity: pending.length,
                  openingOnHand: before.product.inventoryMappedAt
                    ? null
                    : before.product.availableQuantity + pending.length,
                  openingLocation: 'UNALLOCATED_LEGACY',
                };
              },
              { isolationLevel: 'RepeatableRead' },
            ),
          );
          continue;
        }
        results.push(await this.transaction((tx) => this.map(tx, product.id, actorId)));
      } catch (error) {
        results.push({
          productId: product.id,
          error: error instanceof Error ? error.message : String(error),
          reviewRequired: true,
        });
      }
    }
    return {
      dryRun: dto.dryRun,
      items: results,
      nextAfterId: products.at(-1)?.id ?? null,
      hasMore: !dto.productId && products.length === dto.limit,
    };
  }
}
