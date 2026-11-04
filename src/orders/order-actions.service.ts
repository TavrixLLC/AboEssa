import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActorType,
  CheckoutPaymentMethod,
  OrderStatus,
  Prisma,
  ShippingRequestStatus,
} from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { CheckoutDeliveryDto } from 'src/checkout/dto/checkout.dto';
import { deliveryAddress } from 'src/checkout/delivery-address';
import { AppException } from 'src/common/exceptions/app.exception';
import { PrismaService } from 'src/prisma/prisma.service';
import { SocketsService } from 'src/sockets/sockets.service';
import { WalletService } from 'src/wallet/wallet.service';
import { hashRequestMetadata } from 'src/common/security/hash.util';

@Injectable()
export class OrderActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditLogsService,
    private readonly sockets: SocketsService,
  ) {}

  async payWithWallet(customerId: string, orderId: string, request: Request) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
        const order = await tx.order.findFirst({
          where: { id: orderId, customerId },
          include: { items: true },
        });
        if (!order)
          throw new AppException('Order was not found', 'ORDER_NOT_FOUND', HttpStatus.NOT_FOUND);
        const lockedStates: OrderStatus[] = [
          OrderStatus.CANCELLED,
          OrderStatus.SHIPPED,
          OrderStatus.DELIVERED,
        ];
        if (lockedStates.includes(order.status)) {
          throw new AppException(
            'Payment cannot be changed after shipping',
            'ORDER_PAYMENT_LOCKED',
            HttpStatus.CONFLICT,
          );
        }
        if (!order.items.length || order.items.some((item) => !item.checkoutConfirmedAt)) {
          throw new AppException(
            'Order is not confirmed',
            'ORDER_NOT_CONFIRMED',
            HttpStatus.CONFLICT,
          );
        }
        const due = order.items.reduce(
          (sum, item) => sum.plus(item.cashDueAmount),
          new Prisma.Decimal(0),
        );
        if (due.equals(0)) return { orderId, paidAmount: '0.00', alreadyPaid: true };
        await this.wallet.debitPurchase(
          tx,
          customerId,
          due,
          orderId,
          `order-wallet-payment:${orderId}`,
        );
        for (const item of order.items) {
          await tx.orderItem.update({
            where: { id: item.id },
            data: {
              paymentMethod: CheckoutPaymentMethod.WALLET,
              walletPaidAmount: item.price,
              cashDueAmount: 0,
            },
          });
        }
        const ids = order.items.map((item) => item.id);
        const requests = await tx.shipmentRequest.findMany({
          where: {
            customerId,
            status: { not: ShippingRequestStatus.CANCELLED },
            requestedItemIds: { hasSome: ids },
          },
        });
        for (const shipment of requests) {
          if (shipment.requestedItemIds.some((id) => !ids.includes(id)))
            throw new AppException(
              'Combined shipment payment needs support',
              'ORDER_PAYMENT_CONFLICT',
              HttpStatus.CONFLICT,
            );
          await tx.shipmentRequest.update({
            where: { id: shipment.id },
            data: {
              paymentMethod: CheckoutPaymentMethod.WALLET,
              walletPaidAmount: shipment.totalAmount,
              cashDueAmount: 0,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            actorType: ActorType.CUSTOMER,
            actorId: customerId,
            action: 'order.wallet_paid',
            entityType: 'Order',
            entityId: orderId,
            metadata: { amount: due.toFixed(2) },
            ipHash: hashRequestMetadata(request.ip),
            userAgentHash: hashRequestMetadata(request.headers['user-agent']),
          },
        });
        return { orderId, paidAmount: due.toFixed(2), alreadyPaid: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    this.sockets.emitToAdmins('order_updated', { orderId });
    this.sockets.emitToCustomer(customerId, 'order_updated', { orderId });
    return result;
  }

  async updateDelivery(
    customerId: string,
    orderId: string,
    dto: CheckoutDeliveryDto,
    request: Request,
  ) {
    const address = deliveryAddress(dto);
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
        const order = await tx.order.findFirst({
          where: { id: orderId, customerId },
          include: { items: true },
        });
        if (!order)
          throw new AppException('Order was not found', 'ORDER_NOT_FOUND', HttpStatus.NOT_FOUND);
        if (
          order.status !== OrderStatus.SHIPPING_REQUESTED ||
          order.items.some((item) => !item.checkoutConfirmedAt)
        ) {
          throw new AppException(
            'Delivery details cannot be edited after preparation starts',
            'ORDER_DELIVERY_LOCKED',
            HttpStatus.CONFLICT,
          );
        }
        const ids = order.items.map((item) => item.id);
        const requests = await tx.shipmentRequest.findMany({
          where: {
            customerId,
            status: { not: ShippingRequestStatus.CANCELLED },
            requestedItemIds: { hasSome: ids },
          },
        });
        if (
          requests.some(
            (shipment) =>
              shipment.status !== ShippingRequestStatus.REQUESTED ||
              shipment.requestedItemIds.some((id) => !ids.includes(id)),
          )
        ) {
          throw new AppException(
            'Delivery details are already in use',
            'ORDER_DELIVERY_LOCKED',
            HttpStatus.CONFLICT,
          );
        }
        await tx.orderItem.updateMany({
          where: { id: { in: ids }, customerId },
          data: { deliveryAddressSnapshot: address, deliveryPhone: address.phone },
        });
        for (const shipment of requests)
          await tx.shipmentRequest.update({
            where: { id: shipment.id },
            data: { addressSnapshot: address },
          });
        return { orderId, delivery: address };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit.create({
      actorType: ActorType.CUSTOMER,
      actorId: customerId,
      action: 'order.delivery_updated',
      entityType: 'Order',
      entityId: orderId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    this.sockets.emitToAdmins('order_updated', { orderId });
    return result;
  }
}
