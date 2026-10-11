import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CheckoutPaymentMethod,
  CheckoutStatus,
  OrderItem,
  OrderItemStatus,
  OrderStatus,
  Prisma,
  ShippingRequestStatus,
} from '@prisma/client';
import { CheckoutDeliveryDto } from 'src/checkout/dto/checkout.dto';
import { AppException } from 'src/common/exceptions/app.exception';
import { normalizePhone } from 'src/common/utils/phone.util';
import { WalletService } from 'src/wallet/wallet.service';

type CompleteCheckoutInput = {
  customerId: string;
  orderId: string;
  itemIds: string[];
  totalAmount: Prisma.Decimal;
  paymentMethod: CheckoutPaymentMethod;
  delivery: CheckoutDeliveryDto;
  referenceId: string;
  eventKey: string;
  bidHold?: { bidId: string; amount: Prisma.Decimal };
};

@Injectable()
export class CheckoutService {
  constructor(private readonly wallet: WalletService) {}

  depositFor(total: Prisma.Decimal): Prisma.Decimal {
    return total.mul('0.10').toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
  }

  async complete(tx: Prisma.TransactionClient, input: CompleteCheckoutInput) {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, customerId: input.customerId },
    });
    const items = await tx.orderItem.findMany({
      where: { id: { in: input.itemIds }, orderId: input.orderId, customerId: input.customerId },
      orderBy: { id: 'asc' },
    });
    if (
      !order ||
      order.status !== OrderStatus.OPEN ||
      items.length !== input.itemIds.length ||
      items.length === 0 ||
      new Set(input.itemIds).size !== input.itemIds.length
    ) {
      throw new AppException('Order was not found', 'ORDER_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const itemTotal = items.reduce((sum, item) => sum.plus(item.price), new Prisma.Decimal(0));
    if (itemTotal.lessThanOrEqualTo(0) || !itemTotal.equals(input.totalAmount)) {
      throw new AppException('Order total changed', 'ORDER_TOTAL_MISMATCH', HttpStatus.CONFLICT);
    }
    if (
      items.some(
        (item) =>
          item.checkoutConfirmedAt !== null || item.status !== OrderItemStatus.IN_CUSTOMER_BOX,
      )
    ) {
      throw new AppException(
        'Checkout was already completed',
        'CHECKOUT_ALREADY_COMPLETED',
        HttpStatus.CONFLICT,
      );
    }

    const phone = normalizePhone(input.delivery.phone);
    if (!/^\+?[0-9]{10,15}$/.test(phone)) {
      throw new AppException(
        'Invalid delivery phone',
        'INVALID_DELIVERY_PHONE',
        HttpStatus.BAD_REQUEST,
      );
    }
    const delivery = {
      fullName: input.delivery.fullName.trim(),
      phone,
      governorate: input.delivery.governorate.trim(),
      city: input.delivery.city.trim(),
      addressLine: input.delivery.addressLine.trim(),
      nearestPoint: input.delivery.nearestPoint?.trim() || null,
    };
    if (!delivery.fullName || !delivery.governorate || !delivery.city || !delivery.addressLine) {
      throw new AppException(
        'Delivery address is required',
        'DELIVERY_ADDRESS_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }

    const deposit = this.depositFor(input.totalAmount);
    let walletPaid: Prisma.Decimal;
    let cashDue: Prisma.Decimal;
    if (input.bidHold) {
      const held = input.bidHold.amount;
      if (held.greaterThan(input.totalAmount)) {
        throw new AppException('Invalid bid hold', 'INVALID_BID_HOLD', HttpStatus.CONFLICT);
      }
      if (input.paymentMethod === CheckoutPaymentMethod.WALLET) {
        await this.wallet.settleBid(tx, input.customerId, held, input.bidHold.bidId);
        const remainder = input.totalAmount.minus(held);
        if (remainder.greaterThan(0)) {
          await this.wallet.debitPurchase(
            tx,
            input.customerId,
            remainder,
            input.referenceId,
            input.eventKey,
          );
        }
        walletPaid = input.totalAmount;
        cashDue = new Prisma.Decimal(0);
      } else {
        if (held.equals(deposit)) {
          await this.wallet.settleBid(tx, input.customerId, held, input.bidHold.bidId);
        } else {
          // Legacy bids reserved the whole bid. Release that hold, then take only the deposit.
          await this.wallet.releaseBid(tx, input.customerId, held, input.bidHold.bidId);
          await this.wallet.debitCodDeposit(
            tx,
            input.customerId,
            deposit,
            input.referenceId,
            input.eventKey,
          );
        }
        walletPaid = deposit;
        cashDue = input.totalAmount.minus(deposit);
      }
    } else if (input.paymentMethod === CheckoutPaymentMethod.WALLET) {
      await this.wallet.debitPurchase(
        tx,
        input.customerId,
        input.totalAmount,
        input.referenceId,
        input.eventKey,
      );
      walletPaid = input.totalAmount;
      cashDue = new Prisma.Decimal(0);
    } else {
      // Fixed-price cash-on-delivery orders do not require a wallet deposit.
      // The 10% deposit applies only to auctions and arrives here as bidHold.
      walletPaid = new Prisma.Decimal(0);
      cashDue = input.totalAmount;
    }

    const paidCents = walletPaid.mul(100);
    const baseCents = paidCents.div(items.length).floor();
    const extraCents = paidCents.mod(items.length).toNumber();
    const updatedItems: OrderItem[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const itemPaid = baseCents.plus(index < extraCents ? 1 : 0).div(100);
      updatedItems.push(
        await tx.orderItem.update({
          where: { id: items[index].id },
          data: {
            checkoutStatus: CheckoutStatus.AWAITING_FULFILLMENT,
            paymentMethod: input.paymentMethod,
            walletPaidAmount: itemPaid,
            cashDueAmount: new Prisma.Decimal(items[index].price).minus(itemPaid),
            deliveryAddressSnapshot: delivery,
            deliveryPhone: phone,
            checkoutConfirmedAt: new Date(),
            status: OrderItemStatus.SHIPPING_REQUESTED,
          },
        }),
      );
    }
    const updatedOrder = await tx.order.update({
      where: { id: input.orderId },
      data: { status: OrderStatus.SHIPPING_REQUESTED, shippingRequestedAt: new Date() },
    });
    const shipmentRequest = await tx.shipmentRequest.create({
      data: {
        customerId: input.customerId,
        requestedItemIds: input.itemIds,
        totalAmount: input.totalAmount,
        paymentMethod: input.paymentMethod,
        walletPaidAmount: walletPaid,
        cashDueAmount: cashDue,
        addressSnapshot: delivery,
        status: ShippingRequestStatus.REQUESTED,
      },
    });
    return { shipmentRequest, walletPaid, cashDue, updatedItems, updatedOrder };
  }
}
