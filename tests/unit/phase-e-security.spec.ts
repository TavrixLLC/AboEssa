import { StaffStatus } from '@prisma/client';
import { AppException } from 'src/common/exceptions/app.exception';
import { assertPasswordPolicy } from 'src/common/security/password-policy';
import { resolveEffectivePermissions } from 'src/permissions/permission-resolution';
import { StaffService } from 'src/admin-users/staff.service';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { bootstrapInitialOwner } from 'src/maintenance/bootstrap-owner';

describe('Backend Phase E security contracts', () => {
  it('resolves role grants, direct grants, direct denies, duplicates, and owner fallback deterministically', () => {
    expect(resolveEffectivePermissions({ rolePermissionSets: [['products.view', 'products.view'], ['products.edit']], directGrants: ['products.create'], directDenies: ['products.edit'] })).toEqual(['products.create', 'products.view']);
    const owner = resolveEffectivePermissions({ owner: true, directDenies: ['dashboard.view'] });
    expect(owner).toContain('dashboard.view');
    expect(owner).toEqual([...owner].sort());
  });

  it('enforces the centralized password policy without accepting the current password', () => {
    expect(() => assertPasswordPolicy('short1')).toThrow(expect.objectContaining({ code: 'PASSWORD_TOO_WEAK' }));
    expect(() => assertPasswordPolicy('Valid Password1')).toThrow(expect.objectContaining({ code: 'PASSWORD_TOO_WEAK' }));
    expect(() => assertPasswordPolicy('ValidPassword1', 'ValidPassword1')).toThrow(expect.objectContaining({ code: 'PASSWORD_REUSE_NOT_ALLOWED' }));
    expect(() => assertPasswordPolicy('ValidPassword1')).not.toThrow();
  });

  it('redacts sensitive audit metadata recursively and case-insensitively', async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const service = new AuditLogsService({ auditLog: { create } } as any);

    const result = await service.create({
      actorType: 'SYSTEM',
      action: 'SECURITY_TEST',
      entityType: 'Test',
      metadata: {
        passwordHash: 'unsafe-hash',
        CurrentPassword: 'unsafe-password',
        nested: {
          refresh_token_hash: 'unsafe-token',
          Authorization: 'unsafe-header',
          sessionSecret: 'unsafe-secret',
          safeValue: 'preserved',
        },
      },
    });

    expect(result.metadata).toEqual({
      passwordHash: '[REDACTED]',
      CurrentPassword: '[REDACTED]',
      nested: {
        refresh_token_hash: '[REDACTED]',
        Authorization: '[REDACTED]',
        sessionSecret: '[REDACTED]',
        safeValue: 'preserved',
      },
    });
  });

  it('refuses owner bootstrap before mutation when any owner exists', async () => {
    const transaction = {
      adminUser: {
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const passwordService = { hash: jest.fn().mockResolvedValue('opaque-hash') };
    const input = {
      email: 'owner@example.test',
      name: 'Owner',
      password: 'ValidOwnerPassword1',
    };

    await expect(
      bootstrapInitialOwner(prisma as any, passwordService as any, input),
    ).rejects.toBeInstanceOf(Error);
    expect(transaction.adminUser.update).not.toHaveBeenCalled();
    expect(transaction.adminUser.create).not.toHaveBeenCalled();
    expect(input.password).toBe('');
  });

  it('blocks self-deactivation and final-owner deactivation', async () => {
    const prisma = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue({ id: 'owner-1', role: 'OWNER', isOwner: true }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'owner-1', role: 'OWNER', isOwner: true, isActive: true, status: StaffStatus.ACTIVE, roleAssignments: [] }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new StaffService(prisma as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.setStatus('owner-1', StaffStatus.INACTIVE, 'owner-1', {} as any)).rejects.toMatchObject({ code: 'CANNOT_DEACTIVATE_SELF' });
    await expect(service.setStatus('staff-1', StaffStatus.INACTIVE, 'owner-1', {} as any)).rejects.toMatchObject({ code: 'LAST_ACTIVE_OWNER' });
  });

  it('emits staff_updated after a staff profile update', async () => {
    const existing = {
      id: 'staff-1',
      name: 'Staff',
      displayName: 'Staff',
      email: 'staff@example.test',
      normalizedEmail: 'staff@example.test',
      phone: null,
      jobTitle: null,
      notes: null,
      role: 'ADMIN',
      permissions: [],
      deniedPermissions: [],
      isActive: true,
      status: StaffStatus.ACTIVE,
      isOwner: false,
      mustChangePassword: false,
      roleAssignments: [],
    };
    const updated = { ...existing, displayName: 'Updated Staff', name: 'Updated Staff' };
    const prisma = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue({ id: 'owner-1', role: 'OWNER', isOwner: true }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
      adminSession: { count: jest.fn().mockResolvedValue(0) },
    };
    const auditLogs = { create: jest.fn().mockResolvedValue(undefined) };
    const permissionResolver = { forAdmin: jest.fn().mockResolvedValue([]) };
    const sockets = { emitToAdmins: jest.fn() };
    const service = new StaffService(
      prisma as any,
      {} as any,
      auditLogs as any,
      permissionResolver as any,
      sockets as any,
    );

    await service.updateProfile(
      'staff-1',
      { displayName: 'Updated Staff' },
      'owner-1',
      { ip: '127.0.0.1', headers: {} } as any,
    );

    expect(sockets.emitToAdmins).toHaveBeenCalledWith('staff_updated', {
      staffId: 'staff-1',
      change: 'profile',
    });
  });
});
