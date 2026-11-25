import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { StaffService } from 'src/admin-users/staff.service';
import { OWNER_PERMISSIONS } from 'src/common/constants/permissions.constants';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { OptionalJwtAccessGuard } from 'src/common/guards/optional-jwt-access.guard';
import { PermissionResolverService } from 'src/permissions/permission-resolver.service';
import { resolveEffectivePermissions } from 'src/permissions/permission-resolution';
import { PrismaService } from 'src/prisma/prisma.service';
import { SocketsGateway } from 'src/sockets/sockets.gateway';
import { SocketsService } from 'src/sockets/sockets.service';

describe('retired display access', () => {
  function setup() {
    const jwt = {
      decode: jest.fn().mockReturnValue({ type: 'screen', sub: 'legacy-device' }),
      verifyAsync: jest.fn(),
    };
    const request = { headers: { authorization: 'Bearer retired-display-token' } };
    const context = {
      getHandler: () => () => undefined,
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const config = new ConfigService({ jwt: { screenAccessSecret: 'unused-legacy-config' } });
    const reflector = new Reflector();
    const prisma = {} as PrismaService;
    const permissions = {} as PermissionResolverService;
    return { jwt, context, config, reflector, prisma, permissions };
  }

  it('rejects the retired token type in both HTTP guards', async () => {
    const { jwt, context, config, reflector, prisma, permissions } = setup();
    const jwtService = jwt as unknown as JwtService;
    const guards = [
      new JwtAccessGuard(reflector, jwtService, prisma, permissions),
      new OptionalJwtAccessGuard(reflector, jwtService, prisma, config, permissions),
    ];
    for (const guard of guards) {
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: { code: 'INVALID_TOKEN_TYPE' },
      });
    }
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('disconnects legacy display sockets before joining any room', async () => {
    const { jwt, config, prisma } = setup();
    const gateway = new SocketsGateway(
      new SocketsService(),
      jwt as unknown as JwtService,
      config,
      prisma,
    );
    const socket = {
      handshake: { auth: { token: 'retired-display-token' }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
    };

    await gateway.handleConnection(
      socket as unknown as Parameters<typeof gateway.handleConnection>[0],
    );

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('does not advertise the retired management permission', () => {
    expect(OWNER_PERMISSIONS).not.toContain('screens.manage');
  });

  it('ignores obsolete permissions in existing roles and keeps those roles editable', async () => {
    const roleKeys = ['screens.manage', 'dashboard.view'];
    expect(
      resolveEffectivePermissions({
        rolePermissionSets: [roleKeys],
        directGrants: ['screens.manage'],
      }),
    ).toEqual(['dashboard.view']);

    const { permissions } = setup();
    const prisma = {
      adminUser: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER', isOwner: true }) },
      role: { findMany: jest.fn().mockResolvedValue([{ id: 'role-1', permissionKeys: roleKeys }]) },
    } as unknown as PrismaService;
    const service = new StaffService(
      prisma,
      {} as never,
      {} as never,
      permissions,
      new SocketsService(),
    );
    await expect(service.accessPreview({ roleIds: ['role-1'] }, 'owner-1')).resolves.toMatchObject({
      effectivePermissions: ['dashboard.view'],
    });
    await expect(
      service.accessPreview({ directGrantKeys: ['unknown.invalid'] }, 'owner-1'),
    ).rejects.toMatchObject({ code: 'INVALID_PERMISSION_KEY' });
  });
});
