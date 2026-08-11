import { HttpStatus, Injectable } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { AppException } from 'src/common/exceptions/app.exception';
import { PermissionResolverService } from 'src/permissions/permission-resolver.service';
import { PERMISSIONS_CATALOG } from 'src/permissions/permissions.catalog';
import { PrismaService } from 'src/prisma/prisma.service';
import { SocketsService } from 'src/sockets/sockets.service';
import { CreateRoleDto, UpdateRoleDto } from 'src/admin-users/dto/staff-phase-e.dto';

const catalog = PERMISSIONS_CATALOG.flatMap((group) => group.permissions);
const catalogKeys = new Set(catalog.map((item) => item.key));
const ownerOnly = new Set(catalog.filter((item) => item.ownerOnly).map((item) => item.key));

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly sockets: SocketsService,
  ) {}

  private async actor(actorId: string) {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: actorId } });
    const isOwner = admin.isOwner || admin.role === 'OWNER';
    const permissions = isOwner ? undefined : new Set(await this.permissionResolver.forAdmin(actorId));
    return { admin, isOwner, permissions };
  }

  private async keys(keys: string[] | undefined, actorId: string) {
    const unique = [...new Set(keys ?? [])].sort();
    const invalid = unique.filter((key) => !catalogKeys.has(key));
    if (invalid.length) throw new AppException('One or more permission keys are invalid', 'INVALID_PERMISSION_KEY', HttpStatus.BAD_REQUEST, { invalid });
    const actor = await this.actor(actorId);
    const restricted = unique.filter((key) => ownerOnly.has(key));
    if (restricted.length) throw new AppException('Owner-only permissions cannot be included in a normal role', 'OWNER_ONLY_PERMISSION', HttpStatus.FORBIDDEN, { keys: restricted });
    if (!actor.isOwner) {
      const outsideBoundary = unique.filter((key) => !actor.permissions?.has(key));
      if (outsideBoundary.length) throw new AppException('The acting staff member cannot grant permissions they do not have', 'PRIVILEGE_ESCALATION_BLOCKED', HttpStatus.FORBIDDEN, { keys: outsideBoundary });
    }
    return unique;
  }

  private response(role: any) {
    return { id: role.id, name: role.name, description: role.description, isSystem: role.isSystem, isActive: role.isActive, permissionKeys: [...role.permissionKeys].sort(), staffCount: role._count?.staffAssignments ?? role.staffAssignments?.length ?? 0, createdAt: role.createdAt, updatedAt: role.updatedAt };
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }], include: { _count: { select: { staffAssignments: true } } } });
    return roles.map((role) => this.response(role));
  }

  async findOne(id: string) {
    return this.response(await this.prisma.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { staffAssignments: true } } } }));
  }

  async create(dto: CreateRoleDto, actorId: string, request: Request) {
    const permissionKeys = await this.keys(dto.permissionKeys, actorId);
    const role = await this.prisma.role.create({ data: { name: dto.name.trim(), description: dto.description, permissionKeys } });
    await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId, action: 'ROLE_CREATED', entityType: 'Role', entityId: role.id, metadata: { name: role.name, permissionKeys }, ip: request.ip, userAgent: request.headers['user-agent'] });
    return this.findOne(role.id);
  }

  async update(id: string, dto: UpdateRoleDto, actorId: string, request: Request) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id } });
    const actor = await this.actor(actorId);
    if (role.isSystem && !actor.isOwner) throw new AppException('System roles are protected', 'SYSTEM_ROLE_PROTECTED', HttpStatus.FORBIDDEN);
    if (role.isSystem && dto.isActive === false) throw new AppException('System roles cannot be deactivated', 'SYSTEM_ROLE_PROTECTED', HttpStatus.FORBIDDEN);
    const permissionKeys = dto.permissionKeys === undefined ? undefined : await this.keys(dto.permissionKeys, actorId);
    const updated = await this.prisma.role.update({ where: { id }, data: { name: dto.name?.trim(), description: dto.description, isActive: dto.isActive, permissionKeys } });
    const action = dto.isActive === false ? 'ROLE_DEACTIVATED' : dto.isActive === true ? 'ROLE_ACTIVATED' : dto.permissionKeys ? 'ROLE_PERMISSIONS_UPDATED' : 'ROLE_UPDATED';
    await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId, action, entityType: 'Role', entityId: id, metadata: { before: { name: role.name, isActive: role.isActive, permissionKeys: role.permissionKeys }, after: { name: updated.name, isActive: updated.isActive, permissionKeys: updated.permissionKeys } }, ip: request.ip, userAgent: request.headers['user-agent'] });
    this.sockets.emitToAdmins('role_updated', { roleId: id });
    return this.findOne(updated.id);
  }
}
