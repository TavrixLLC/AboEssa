/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { HttpStatus } from '@nestjs/common';
import { ScreenStatus } from '@prisma/client';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { PERMISSIONS_KEY } from 'src/common/decorators/permissions.decorator';
import { ScreensController } from 'src/screens/screens.controller';
import { ScreensService } from 'src/screens/screens.service';

const request = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;

describe('Display App Phase backend', () => {
  const screen = {
    id: 'screen-1',
    installationId: '19f920f7-4669-46f7-884d-f5c5ee467c30',
    name: 'Main TV',
    tokenHash: 'stored-hash',
    tokenVersion: 2,
    status: ScreenStatus.ACTIVE,
    isActive: true,
    pairedAt: new Date('2026-08-20T10:00:00.000Z'),
    lastSeenAt: new Date(),
    revokedAt: null,
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    updatedAt: new Date('2026-08-20T10:00:00.000Z'),
  };

  function harness() {
    const challenge = {
      id: 'challenge-1',
      installationId: screen.installationId,
      codeHash: 'code-hash',
      expiresAt: new Date(Date.now() + 300_000),
      usedAt: null as Date | null,
      cancelledAt: null as Date | null,
      credentialIssuedAt: null as Date | null,
      screenDeviceId: null as string | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma: any = {
      screenPairingChallenge: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...challenge, ...data })),
        findUnique: jest.fn().mockResolvedValue(challenge),
        update: jest.fn().mockResolvedValue(challenge),
      },
      screenDevice: {
        findUnique: jest.fn().mockResolvedValue(screen),
        findUniqueOrThrow: jest.fn().mockResolvedValue(screen),
        findMany: jest.fn().mockResolvedValue([screen]),
        upsert: jest.fn().mockResolvedValue(screen),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...screen, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      quickSaleDisplayRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'display-sale-1',
            customerDisplayName: 'Ahmed',
            amount: { toString: () => '250000' },
            currency: 'IQD',
            createdAt: new Date('2026-08-20T11:00:00.000Z'),
          },
        ]),
      },
    };
    prisma.$transaction = jest.fn().mockImplementation((callback) => callback(prisma));
    const tokenService = { signScreenAccess: jest.fn().mockResolvedValue('device-credential') };
    const passwordService = {
      hash: jest.fn().mockResolvedValue('secure-hash'),
      verify: jest.fn().mockResolvedValue(true),
    };
    const auditLogs = { create: jest.fn().mockResolvedValue({}) };
    const config = {
      get: jest
        .fn()
        .mockImplementation((key: string) => (key === 'screens.pairingTtlSeconds' ? 300 : 120)),
    };
    const sockets = { disconnectScreen: jest.fn() };
    const service = new ScreensService(
      prisma,
      tokenService as any,
      passwordService,
      auditLogs as any,
      config as any,
      sockets as any,
    );
    return {
      service,
      prisma,
      tokenService,
      passwordService,
      auditLogs,
      sockets,
      challenge,
    };
  }

  it('creates a five-minute opaque pairing challenge and cancels the prior challenge', async () => {
    const { service, prisma } = harness();
    const before = Date.now();
    const result = await service.createPairingChallenge({
      installationId: screen.installationId,
    });

    expect(prisma.screenPairingChallenge.updateMany).toHaveBeenCalled();
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 299_000);
    expect(result.pairingUri).toMatch(/^aboessa:\/\/display\/pair\?/);
    expect(result).not.toHaveProperty('accessToken');
  });

  it('rejects an invalid pairing secret', async () => {
    const { service, passwordService } = harness();
    passwordService.verify.mockResolvedValue(false);
    await expect(
      service.pairingStatus('challenge-1', { code: 'x'.repeat(43) }),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED, code: 'PAIRING_INVALID' });
  });

  it('reports a pending pairing without issuing any credential', async () => {
    const { service, tokenService } = harness();
    const result = await service.pairingStatus('challenge-1', { code: 'x'.repeat(43) });
    expect(result).toEqual({ status: 'PENDING' });
    expect(tokenService.signScreenAccess).not.toHaveBeenCalled();
  });

  it('reports an expired challenge and does not issue a credential', async () => {
    const { service, challenge, prisma, tokenService } = harness();
    challenge.expiresAt = new Date(Date.now() - 1);
    prisma.screenPairingChallenge.findUnique.mockResolvedValue(challenge);
    await expect(
      service.pair({ challengeId: challenge.id, code: 'x'.repeat(43) }, 'admin-1', request),
    ).rejects.toMatchObject({ code: 'PAIRING_EXPIRED' });
    expect(tokenService.signScreenAccess).not.toHaveBeenCalled();
  });

  it('reports a cancelled challenge', async () => {
    const { service, challenge, prisma } = harness();
    challenge.cancelledAt = new Date();
    prisma.screenPairingChallenge.findUnique.mockResolvedValue(challenge);
    await expect(
      service.pair({ challengeId: challenge.id, code: 'x'.repeat(43) }, 'admin-1', request),
    ).rejects.toMatchObject({ code: 'PAIRING_CANCELLED' });
  });

  it('prevents a pairing challenge from being used twice', async () => {
    const { service, challenge, prisma } = harness();
    challenge.usedAt = new Date();
    prisma.screenPairingChallenge.findUnique.mockResolvedValue(challenge);
    await expect(
      service.pair({ challengeId: challenge.id, code: 'x'.repeat(43) }, 'admin-1', request),
    ).rejects.toMatchObject({ code: 'PAIRING_ALREADY_USED' });
  });

  it('pairs an authorized Admin challenge without returning the display credential', async () => {
    const { service, prisma, auditLogs } = harness();
    const result = await service.pair(
      { challengeId: 'challenge-1', code: 'x'.repeat(43), name: 'Cashier TV' },
      'admin-1',
      request,
    );
    expect(prisma.screenDevice.upsert).toHaveBeenCalled();
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SCREEN_PAIRED' }),
    );
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('tokenHash');
    expect(result).not.toHaveProperty('tokenVersion');
  });

  it('enforces screens.manage on the Admin pairing endpoint', () => {
    const permissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      ScreensController.prototype.pair,
    ) as string[];
    expect(permissions).toEqual([PERMISSIONS.SCREENS_MANAGE]);
  });

  it('issues the display credential to the TV once and stores only its hash', async () => {
    const { service, challenge, prisma, passwordService } = harness();
    challenge.usedAt = new Date();
    challenge.screenDeviceId = screen.id;
    prisma.screenPairingChallenge.findUnique.mockResolvedValue(challenge);
    const result = await service.pairingStatus(challenge.id, { code: 'x'.repeat(43) });
    expect(result.status).toBe('PAIRED');
    expect(result).toHaveProperty('accessToken');
    expect(passwordService.hash).toHaveBeenCalledWith('device-credential');
    expect(prisma.screenDevice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tokenHash: 'secure-hash' }) }),
    );
  });

  it('does not issue the credential again after delivery', async () => {
    const { service, challenge, prisma, tokenService } = harness();
    challenge.usedAt = new Date();
    challenge.screenDeviceId = screen.id;
    challenge.credentialIssuedAt = new Date();
    prisma.screenPairingChallenge.findUnique.mockResolvedValue(challenge);
    const result = await service.pairingStatus(challenge.id, { code: 'x'.repeat(43) });
    expect(result).toEqual({ status: 'PAIRED', credentialIssued: true });
    expect(tokenService.signScreenAccess).not.toHaveBeenCalled();
  });

  it('returns revoked state instead of a credential', async () => {
    const { service, challenge, prisma } = harness();
    challenge.usedAt = new Date();
    challenge.screenDeviceId = screen.id;
    prisma.screenPairingChallenge.findUnique.mockResolvedValue(challenge);
    prisma.screenDevice.findUnique.mockResolvedValue({
      ...screen,
      status: ScreenStatus.REVOKED,
      isActive: false,
    });
    await expect(service.pairingStatus(challenge.id, { code: 'x'.repeat(43) })).resolves.toEqual({
      status: 'REVOKED',
    });
  });

  it('lists display devices without installation or credential material', async () => {
    const { service } = harness();
    const result = await service.findAll();
    expect(result[0]).toMatchObject({ id: screen.id, name: screen.name });
    expect(result[0]).not.toHaveProperty('installationId');
    expect(result[0]).not.toHaveProperty('tokenHash');
    expect(result[0]).not.toHaveProperty('tokenVersion');
  });

  it('returns recent Quick Sales newest first using backend ordering', async () => {
    const { service, prisma } = harness();
    await service.recentQuickSales(screen.id);
    expect(prisma.quickSaleDisplayRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
      }),
    );
  });

  it('returns only safe Quick Sale display fields and never phone data', async () => {
    const { service } = harness();
    const [result] = await service.recentQuickSales(screen.id);
    expect(result).toEqual({
      id: 'display-sale-1',
      customerDisplayName: 'Ahmed',
      amount: '250000',
      currency: 'IQD',
      createdAt: new Date('2026-08-20T11:00:00.000Z'),
    });
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('customerId');
    expect(result).not.toHaveProperty('orderItemId');
  });

  it('revokes the credential version and disconnects the active socket', async () => {
    const { service, prisma, sockets } = harness();
    await service.revoke(screen.id, 'admin-1', request);
    expect(prisma.screenDevice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ScreenStatus.REVOKED,
          isActive: false,
          tokenVersion: { increment: 1 },
        }),
      }),
    );
    expect(sockets.disconnectScreen).toHaveBeenCalledWith(screen.id);
  });

  it('supports a screen-initiated reset without exposing a credential', async () => {
    const { service, auditLogs } = harness();
    await expect(service.revokeSelf(screen.id, request)).resolves.toEqual({ revoked: true });
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SCREEN_SELF_REVOKED' }),
    );
  });
});
