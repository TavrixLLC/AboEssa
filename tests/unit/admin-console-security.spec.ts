import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminConsoleController } from 'src/admin-console/admin-console.controller';
import { ConsoleOrderActionDto, ConsoleOrdersQueryDto } from 'src/admin-console/console.dto';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';

describe('Admin essential order permissions and validation', () => {
  const service = { changeOrder: jest.fn().mockResolvedValue({}) };
  const controller = new AdminConsoleController(service as any);
  beforeEach(() => jest.clearAllMocks());
  it('does not let shipping-manage staff ship, deliver or refund without the additional permission', () => {
    const actor = { id: 'staff', role: 'ADMIN', permissions: ['shipping.manage'] } as any;
    for (const action of ['SHIP', 'DELIVER', 'CANCEL']) {
      expect(() => controller.change('order', { action }, actor, {} as any)).toThrow(
        expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' }),
      );
    }
    expect(service.changeOrder).not.toHaveBeenCalled();
  });
  it('allows an owner and explicitly authorized staff to perform sensitive actions', () => {
    controller.change(
      'order',
      { action: 'CANCEL', reason: 'customer request' },
      { id: 'owner', role: 'OWNER' } as any,
      {} as any,
    );
    controller.change(
      'order',
      { action: 'SHIP', shippingCompany: 'carrier' },
      { id: 'staff', role: 'ADMIN', permissions: ['shipping.manage', 'shipping.ship'] } as any,
      {} as any,
    );
    expect(service.changeOrder).toHaveBeenCalledTimes(2);
  });
  it('protects order reads and mutations with shipping.manage', () => {
    const guard = new PermissionsGuard(new Reflector());
    for (const method of [controller.orders, controller.order, controller.change]) {
      const context = {
        getHandler: () => method,
        getClass: () => AdminConsoleController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: 'VIEWER', permissions: ['products.view'] } }),
        }),
      } as any;
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' }),
      );
    }
  });
  it('rejects forged transitions, negative fees, oversized reasons and client-controlled financial fields', async () => {
    for (const data of [
      { action: 'REFUND' },
      { action: 'SHIP', shippingPrice: -1 },
      { action: 'CANCEL', reason: 'x'.repeat(501) },
      { action: 'CANCEL', walletPaidAmount: 999999 },
    ]) {
      const errors = await validate(plainToInstance(ConsoleOrderActionDto, data), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      expect(errors.length).toBeGreaterThan(0);
    }
  });
  it('rejects unsupported states and excessive pagination input', async () => {
    expect(
      (
        await validate(
          plainToInstance(ConsoleOrdersQueryDto, { state: 'PAID', search: 'x'.repeat(121) }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
