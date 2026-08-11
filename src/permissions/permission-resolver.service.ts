import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { resolveEffectivePermissions } from 'src/permissions/permission-resolution';

@Injectable()
export class PermissionResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async forAdmin(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      include: { roleAssignments: { include: { role: true } } },
    });
    if (!admin) return [];
    return resolveEffectivePermissions({
      owner: admin.isOwner || admin.role === 'OWNER',
      rolePermissionSets: admin.roleAssignments.filter((assignment) => assignment.role.isActive).map((assignment) => assignment.role.permissionKeys),
      directGrants: admin.permissions,
      directDenies: admin.deniedPermissions,
    });
  }
}
