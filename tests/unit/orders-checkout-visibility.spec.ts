import { CheckoutStatus, OrderStatus } from '@prisma/client';
import { OrdersService } from 'src/orders/orders.service';

describe('OrdersService checkout visibility', () => {
  it('hides auction wins until the customer confirms payment and delivery', async () => {
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OrdersService(prisma as never);

    await service.customerOrders('customer-1');

    const confirmedCheckoutWhere = {
      OR: [
        { checkoutStatus: null },
        { checkoutStatus: { not: CheckoutStatus.AWAITING_SELECTION } },
      ],
    };
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {
        customerId: 'customer-1',
        status: { not: OrderStatus.CANCELLED },
        items: { some: confirmedCheckoutWhere },
      },
      include: {
        items: {
          where: confirmedCheckoutWhere,
          include: { category: true },
          orderBy: { soldAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });
});
