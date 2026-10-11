import { HttpStatus } from '@nestjs/common';
import { ActorType, CustomerStatus, Prisma, VerificationStatus } from '@prisma/client';
import { Request } from 'express';
import { CustomerAuthService } from 'src/customer-auth/customer-auth.service';

describe('Customer account deletion', () => {
  const request = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
  } as Request;

  function setup(passwordMatches = true) {
    const tx = {
      notification: { deleteMany: jest.fn() },
      customerDevice: { deleteMany: jest.fn() },
      customerNotificationSettings: { deleteMany: jest.fn() },
      verificationRequest: { deleteMany: jest.fn() },
      customerAddress: { deleteMany: jest.fn() },
      customerBox: { deleteMany: jest.fn() },
      referralAttribution: { deleteMany: jest.fn() },
      fileAsset: { deleteMany: jest.fn() },
      idempotencyKey: { deleteMany: jest.fn() },
      auditLog: { deleteMany: jest.fn() },
      bid: { updateMany: jest.fn() },
      shipmentRequest: { updateMany: jest.fn() },
      customer: { update: jest.fn() },
    };
    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer-delete-test',
          passwordHash: 'opaque-hash',
          deletedAt: null,
        }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    };
    const passwordService = {
      verify: jest.fn().mockResolvedValue(passwordMatches),
    };
    const auditLogs = { create: jest.fn() };
    const service = new CustomerAuthService(
      prisma as never,
      passwordService as never,
      {} as never,
      auditLogs as never,
    );
    return { service, prisma, passwordService, auditLogs, tx };
  }

  it('erases personal data while retaining only anonymized transaction links', async () => {
    const { service, tx, auditLogs } = setup();

    const result = await service.deleteAccountFromWeb(
      '+9647700000000',
      'valid-password',
      request,
    );

    expect(result.deleted).toBe(true);
    expect(tx.customerDevice.deleteMany).toHaveBeenCalledWith({
      where: { customerId: 'customer-delete-test' },
    });
    expect(tx.customerAddress.deleteMany).toHaveBeenCalledWith({
      where: { customerId: 'customer-delete-test' },
    });
    expect(tx.shipmentRequest.updateMany).toHaveBeenCalledWith({
      where: { customerId: 'customer-delete-test' },
      data: { addressSnapshot: Prisma.DbNull, customerNote: null },
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-delete-test' },
      data: expect.objectContaining({
        displayName: 'Deleted customer',
        phone: null,
        whatsappPhone: null,
        passwordHash: null,
        refreshTokenHash: null,
        status: CustomerStatus.BLOCKED,
        verificationStatus: VerificationStatus.UNVERIFIED,
        deletedAt: expect.any(Date),
      }),
    });
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: ActorType.SYSTEM,
        action: 'customer.account_deleted',
      }),
    );
  });

  it('rejects invalid credentials without changing account data', async () => {
    const { service, prisma, tx } = setup(false);

    await expect(
      service.deleteAccountFromWeb('+9647700000000', 'wrong-password', request),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
});
