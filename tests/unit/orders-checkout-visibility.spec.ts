import { CheckoutStatus } from '@prisma/client';
import { OrdersService } from 'src/orders/orders.service';

describe('OrdersService checkout visibility', () => {
  it('includes automatically confirmed and cancelled orders, but hides legacy incomplete checkouts', async () => {
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
