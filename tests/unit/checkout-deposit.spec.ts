import { CheckoutPaymentMethod, OrderItemStatus, OrderStatus, Prisma } from '@prisma/client';
import { CheckoutService } from 'src/checkout/checkout.service';

const money = (value: string) => new Prisma.Decimal(value);
const delivery = {
  fullName: 'Test Customer',
  phone: '07738006852',
  governorate: 'Baghdad',
  city: 'Baghdad',
  addressLine: 'Test address',
};

function setup() {
  const wallet = {
    debitPurchase: jest.fn(),
    debitCodDeposit: jest.fn(),
    settleBid: jest.fn(),
    releaseBid: jest.fn(),
  };
  const tx = {
    order: {
      findFirst: jest.fn().mockResolvedValue({ id: 'order-1', status: OrderStatus.OPEN }),
      update: jest.fn().mockResolvedValue({}),
    },
    orderItem: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'item-1',
          orderId: 'order-1',
          customerId: 'customer-1',
          price: money('2000'),
          status: OrderItemStatus.IN_CUSTOMER_BOX,
          checkoutConfirmedAt: null,
        },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
    shipmentRequest: { create: jest.fn().mockResolvedValue({ id: 'shipment-1' }) },
  };
  const service = new CheckoutService(wallet as never);
  const input = {
    customerId: 'customer-1',
    orderId: 'order-1',
    itemIds: ['item-1'],
    totalAmount: money('2000'),
    delivery,
    referenceId: 'item-1',
    eventKey: 'test-1',
  };
  return { wallet, tx, service, input };
}

describe('Checkout payment policy', () => {
  it('calculates the hold from the proposed bid and rounds up to cents', () => {
    const { service } = setup();
    expect(service.depositFor(money('2000')).toFixed(2)).toBe('200.00');
    expect(service.depositFor(money('10.01')).toFixed(2)).toBe('1.01');
  });

  it('product COD does not debit the wallet and records the full amount due', async () => {
    const { service, wallet, tx, input } = setup();
    const result = await service.complete(tx as never, {
      ...input,
      paymentMethod: CheckoutPaymentMethod.CASH_ON_DELIVERY,
    });
    expect(result.walletPaid.toFixed(2)).toBe('0.00');
    expect(result.cashDue.toFixed(2)).toBe('2000.00');
    expect(wallet.debitCodDeposit).not.toHaveBeenCalled();
    expect(wallet.debitPurchase).not.toHaveBeenCalled();
    expect(tx.shipmentRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletPaidAmount: money('0'),
          cashDueAmount: money('2000'),
        }),
      }),
    );
  });

  it('auction COD applies the existing hold without charging another deposit', async () => {
    const { service, wallet, tx, input } = setup();
    const result = await service.complete(tx as never, {
      ...input,
      paymentMethod: CheckoutPaymentMethod.CASH_ON_DELIVERY,
      bidHold: { bidId: 'bid-1', amount: money('200') },
    });
    expect(result.cashDue.toFixed(2)).toBe('1800.00');
    expect(wallet.settleBid).toHaveBeenCalledWith(tx, 'customer-1', money('200'), 'bid-1');
    expect(wallet.debitCodDeposit).not.toHaveBeenCalled();
    expect(wallet.debitPurchase).not.toHaveBeenCalled();
  });

  it('auction wallet payment applies the hold and charges only the remainder', async () => {
    const { service, wallet, tx, input } = setup();
    const result = await service.complete(tx as never, {
      ...input,
      paymentMethod: CheckoutPaymentMethod.WALLET,
      bidHold: { bidId: 'bid-1', amount: money('200') },
    });
    expect(result.walletPaid.toFixed(2)).toBe('2000.00');
    expect(result.cashDue.toFixed(2)).toBe('0.00');
    expect(wallet.settleBid).toHaveBeenCalledWith(tx, 'customer-1', money('200'), 'bid-1');
    expect(wallet.debitPurchase).toHaveBeenCalledWith(
      tx,
      'customer-1',
      money('1800'),
      'item-1',
      'test-1',
    );
  });

  it('rejects repeating checkout before any wallet mutation', async () => {
    const { service, wallet, tx, input } = setup();
    tx.orderItem.findMany.mockResolvedValue([
      {
        id: 'item-1',
        orderId: 'order-1',
        customerId: 'customer-1',
        price: money('2000'),
        status: OrderItemStatus.SHIPPING_REQUESTED,
        checkoutConfirmedAt: new Date(),
      },
    ]);
    await expect(
      service.complete(tx as never, {
        ...input,
        paymentMethod: CheckoutPaymentMethod.WALLET,
      }),
    ).rejects.toMatchObject({ code: 'CHECKOUT_ALREADY_COMPLETED' });
    expect(wallet.debitPurchase).not.toHaveBeenCalled();
  });
});
