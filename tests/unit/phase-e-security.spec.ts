import { StaffStatus } from '@prisma/client';
import { AppException } from 'src/common/exceptions/app.exception';
import { assertPasswordPolicy } from 'src/common/security/password-policy';
import { resolveEffectivePermissions } from 'src/permissions/permission-resolution';
import { StaffService } from 'src/admin-users/staff.service';

describe('Backend Phase E security contracts', () => {
  it('resolves role grants, direct grants, direct denies, duplicates, and owner fallback deterministically', () => {
    expect(resolveEffectivePermissions({ rolePermissionSets: [['products.view', 'products.view'], ['products.edit']], directGrants: ['products.create'], directDenies: ['products.edit'] })).toEqual(['products.create', 'products.view']);
    const owner = resolveEffectivePermissions({ owner: true, directDenies: ['dashboard.view'] });
    expect(owner).toContain('dashboard.view');
    expect(owner).toEqual([...owner].sort());
  });

  it('enforces the centralized password policy without accepting the current password', () => {
    expect(() => assertPasswordPolicy('short1')).toThrow(expect.objectContaining({ code: 'PASSWORD_TOO_WEAK' }));
    expect(() => assertPasswordPolicy('ValidPassword1', 'ValidPassword1')).toThrow(expect.objectContaining({ code: 'PASSWORD_REUSE_NOT_ALLOWED' }));
    expect(() => assertPasswordPolicy('ValidPassword1')).not.toThrow();
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
});
