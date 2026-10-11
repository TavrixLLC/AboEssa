import { HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, Prisma, StaffStatus } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { hashRequestMetadata } from 'src/common/security/hash.util';
import { assertPasswordPolicy } from 'src/common/security/password-policy';
import { PasswordService } from 'src/common/security/password.service';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { toSafeAdminUser } from 'src/common/utils/safe-user.util';
import { PermissionResolverService } from 'src/permissions/permission-resolver.service';
import { PERMISSIONS_CATALOG } from 'src/permissions/permissions.catalog';
import { SocketsService } from 'src/sockets/sockets.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  AccessPreviewDto,
  CreateStaffDto,
  ResetStaffPasswordDto,
  StaffAccessDto,
  StaffQueryDto,
  UpdateStaffProfileDto,
} from 'src/admin-users/dto/staff-phase-e.dto';

const catalogItems = PERMISSIONS_CATALOG.flatMap((group) => group.permissions);
const catalogKeys = new Set(catalogItems.map((item) => item.key));
const ownerOnlyKeys = new Set(catalogItems.filter((item) => item.ownerOnly).map((item) => item.key));

const requestIp = (request: Request) => request.ip;
const requestAgent = (request: Request) => request.headers['user-agent'];
const safeAgent = (value: string | string[] | undefined) => {
  const text = Array.isArray(value) ? value[0] : value;
  return text?.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
};
const safeIp = (value?: string) => {
  if (!value) return undefined;
  if (value.includes(':')) return `${hashRequestMetadata(value)?.slice(0, 12)}…`;
  const parts = value.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : `${hashRequestMetadata(value)?.slice(0, 12)}…`;
};

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditLogs: AuditLogsService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly sockets: SocketsService,
  ) {}

  private isOwner(admin: { role: string; isOwner: boolean }) {
    return admin.isOwner || admin.role === 'OWNER';
  }

  private async actor(actorId: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: actorId } });
    if (!admin) throw new AppException('Actor staff account was not found', 'ACTOR_NOT_FOUND', HttpStatus.UNAUTHORIZED);
    return admin;
  }

  private async target(id: string) {
    return this.prisma.adminUser.findUniqueOrThrow({
      where: { id },
      include: { roleAssignments: { include: { role: true } } },
    });
  }

  private validateKeys(keys: string[] = []) {
    const invalid = [...new Set(keys)].filter((key) => !catalogKeys.has(key));
    if (invalid.length) throw new AppException('One or more permission keys are invalid', 'INVALID_PERMISSION_KEY', HttpStatus.BAD_REQUEST, { invalid });
    return [...new Set(keys)].sort();
  }

  private async validateAssignable(keys: string[], actorId: string, actorIsOwner: boolean) {
    const normalized = this.validateKeys(keys);
    const ownerOnly = normalized.filter((key) => ownerOnlyKeys.has(key));
    if (ownerOnly.length) {
      throw new AppException('Owner-only permissions cannot be assigned to normal staff', 'OWNER_ONLY_PERMISSION', HttpStatus.FORBIDDEN, { keys: ownerOnly });
    }
    if (!actorIsOwner) {
      const actorPermissions = new Set(await this.permissionResolver.forAdmin(actorId));
      const outsideBoundary = normalized.filter((key) => !actorPermissions.has(key));
      if (outsideBoundary.length) {
        throw new AppException('The acting staff member cannot grant permissions they do not have', 'PRIVILEGE_ESCALATION_BLOCKED', HttpStatus.FORBIDDEN, { keys: outsideBoundary });
      }
    }
    return normalized;
  }

  private async assertTargetAccess(actorId: string, targetId: string) {
    const [actor, target] = await Promise.all([this.actor(actorId), this.target(targetId)]);
    const actorOwner = this.isOwner(actor);
    if (this.isOwner(target) && !actorOwner) {
      throw new AppException('Owner account is protected', 'OWNER_PROTECTED', HttpStatus.FORBIDDEN);
    }
    return { actor, target, actorOwner };
  }

  private safeStaff(admin: any, effectivePermissions?: string[]) {
    return {
      ...toSafeAdminUser(admin),
      roles: (admin.roleAssignments ?? []).filter((assignment: any) => assignment.role?.isActive !== false).map((assignment: any) => ({
        id: assignment.role.id,
        name: assignment.role.name,
        isSystem: assignment.role.isSystem,
        isActive: assignment.role.isActive,
      })),
      directGrants: [...(admin.permissions ?? [])].sort(),
      directDenies: [...(admin.deniedPermissions ?? [])].sort(),
      effectivePermissions: effectivePermissions ?? [],
    };
  }

  async findAll(query: StaffQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.AdminUserWhereInput = {
      status: query.status as StaffStatus | undefined,
      isActive: query.isActive,
      roleAssignments: query.roleId ? { some: { roleId: query.roleId } } : undefined,
      OR: query.search
        ? [
            { displayName: { contains: query.search, mode: 'insensitive' } },
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
            { jobTitle: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const orderBy: Prisma.AdminUserOrderByWithRelationInput[] = query.sortBy
      ? [{ [query.sortBy === 'displayName' ? 'displayName' : query.sortBy]: query.sortOrder ?? 'asc' }, { id: 'asc' }]
      : [{ status: 'asc' }, { isOwner: 'desc' }, { displayName: 'asc' }, { email: 'asc' }, { id: 'asc' }];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminUser.findMany({ where, include: { roleAssignments: { include: { role: true } } }, orderBy, skip: pagination.skip, take: pagination.take }),
      this.prisma.adminUser.count({ where }),
    ]);
    const safe = await Promise.all(items.map(async (admin) => this.safeStaff(admin, await this.permissionResolver.forAdmin(admin.id))));
    return toPaginatedResult(safe, total, pagination.page, pagination.limit);
  }

  async findOne(id: string) {
    const admin = await this.target(id);
    const [effectivePermissions, activeSessions, totalSessions] = await Promise.all([
      this.permissionResolver.forAdmin(id),
      this.prisma.adminSession.count({ where: { adminUserId: id, revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.adminSession.count({ where: { adminUserId: id } }),
    ]);
    return {
      ...this.safeStaff(admin, effectivePermissions),
      sessionSummary: { activeCount: activeSessions, totalCount: totalSessions },
    };
  }

  async create(dto: CreateStaffDto, actorId: string, request: Request) {
    const actor = await this.actor(actorId);
    const actorOwner = this.isOwner(actor);
    assertPasswordPolicy(dto.temporaryPassword);
    const email = dto.email.trim().toLowerCase();
    const roleIds = [...new Set(dto.roleIds ?? [])];
    const roles = roleIds.length ? await this.prisma.role.findMany({ where: { id: { in: roleIds }, isActive: true } }) : [];
    if (roles.length !== roleIds.length) throw new AppException('One or more roles were not found or are inactive', 'INVALID_ROLE', HttpStatus.BAD_REQUEST);
    const rolePermissions = roles.flatMap((role) => role.permissionKeys);
    await this.validateAssignable([...rolePermissions, ...(dto.directGrantKeys ?? [])], actorId, actorOwner);
    const grants = this.validateKeys(dto.directGrantKeys);
    const denies = this.validateKeys(dto.directDenyKeys);
    if (!actorOwner && denies.some((key) => ownerOnlyKeys.has(key))) throw new AppException('Owner-only permissions cannot be denied or assigned to normal staff', 'OWNER_ONLY_PERMISSION', 403);
    const passwordHash = await this.passwordService.hash(dto.temporaryPassword);
    const admin = await this.prisma.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: {
          name: dto.displayName,
          displayName: dto.displayName,
          email,
          normalizedEmail: email,
          phone: dto.phone,
          jobTitle: dto.jobTitle,
          notes: dto.notes,
          passwordHash,
          permissions: grants,
          deniedPermissions: denies,
          status: StaffStatus.ACTIVE,
          isActive: true,
          isOwner: false,
          mustChangePassword: dto.mustChangePassword ?? true,
          roleAssignments: roleIds.length ? { create: roleIds.map((roleId) => ({ roleId })) } : undefined,
        },
      });
      return created;
    });
    await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId, action: 'STAFF_CREATED', entityType: 'AdminUser', entityId: admin.id, metadata: { email, displayName: dto.displayName, roleIds }, ip: requestIp(request), userAgent: requestAgent(request) });
    this.sockets.emitToAdmins('staff_updated', { staffId: admin.id, change: 'created' });
    return this.findOne(admin.id);
  }

  async updateProfile(id: string, dto: UpdateStaffProfileDto, actorId: string, request: Request) {
    await this.assertTargetAccess(actorId, id);
    const previous = await this.target(id);
    const data: Prisma.AdminUserUpdateInput = {
      displayName: dto.displayName,
      name: dto.displayName,
      email: dto.email?.trim().toLowerCase(),
      normalizedEmail: dto.email?.trim().toLowerCase(),
      phone: dto.phone,
      jobTitle: dto.jobTitle,
      notes: dto.notes,
    };
    const admin = await this.prisma.adminUser.update({ where: { id }, data, include: { roleAssignments: { include: { role: true } } } });
    await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId, action: 'STAFF_UPDATED', entityType: 'AdminUser', entityId: id, metadata: { before: { displayName: previous.displayName ?? previous.name, email: previous.email, phone: previous.phone, jobTitle: previous.jobTitle }, after: { displayName: admin.displayName ?? admin.name, email: admin.email, phone: admin.phone, jobTitle: admin.jobTitle } }, ip: requestIp(request), userAgent: requestAgent(request) });
    this.sockets.emitToAdmins('staff_updated', { staffId: id, change: 'profile' });
    return this.findOne(id);
  }

  async setStatus(id: string, status: StaffStatus, actorId: string, request: Request) {
    const { target, actorOwner } = await this.assertTargetAccess(actorId, id);
    if (status === StaffStatus.INACTIVE || status === StaffStatus.LOCKED) {
      if (id === actorId) throw new AppException(status === StaffStatus.LOCKED ? 'You cannot lock your own account' : 'You cannot deactivate your own account', status === StaffStatus.LOCKED ? 'CANNOT_LOCK_SELF' : 'CANNOT_DEACTIVATE_SELF', HttpStatus.FORBIDDEN);
      if (this.isOwner(target)) {
        const activeOwners = await this.prisma.adminUser.count({ where: { isOwner: true, status: StaffStatus.ACTIVE, isActive: true } });
        if (activeOwners <= 1) throw new AppException('At least one active owner must remain', 'LAST_ACTIVE_OWNER', HttpStatus.FORBIDDEN);
        if (!actorOwner) throw new AppException('Owner account is protected', 'OWNER_PROTECTED', HttpStatus.FORBIDDEN);
      }
    }
    const isActive = status === StaffStatus.ACTIVE;
    const admin = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.adminUser.update({ where: { id }, data: { status, isActive, deactivatedAt: isActive ? null : new Date(), deactivatedById: isActive ? null : actorId, tokenVersion: status === StaffStatus.ACTIVE ? undefined : { increment: 1 }, refreshTokenHash: status === StaffStatus.ACTIVE ? undefined : null } });
      if (!isActive) await tx.adminSession.updateMany({ where: { adminUserId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return updated;
    });
    const action = status === StaffStatus.ACTIVE ? 'STAFF_ACTIVATED' : status === StaffStatus.LOCKED ? 'STAFF_LOCKED' : 'STAFF_DEACTIVATED';
    await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId, action, entityType: 'AdminUser', entityId: id, metadata: { status }, ip: requestIp(request), userAgent: requestAgent(request) });
    this.sockets.emitToAdmins('staff_status_changed', { staffId: id, status });
    if (!isActive) this.sockets.emitToAdmins('staff_session_revoked', { staffId: id, reason: status.toLowerCase() });
    return this.findOne(admin.id);
  }

  async resetPassword(id: string, dto: ResetStaffPasswordDto, actorId: string, request: Request) {
    const { target } = await this.assertTargetAccess(actorId, id);
    if (this.isOwner(target) && actorId !== id) {
      const actor = await this.actor(actorId);
      if (!this.isOwner(actor)) throw new AppException('Resetting an owner password requires owner authority', 'OWNER_PROTECTED', 403);
    }
    assertPasswordPolicy(dto.newTemporaryPassword);
    const passwordHash = await this.passwordService.hash(dto.newTemporaryPassword);
    const admin = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.adminUser.update({ where: { id }, data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: dto.mustChangePassword ?? true, refreshTokenHash: null, tokenVersion: { increment: 1 } } });
      await tx.adminSession.updateMany({ where: { adminUserId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return updated;
    });
    await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId, action: 'STAFF_PASSWORD_RESET', entityType: 'AdminUser', entityId: id, metadata: { mustChangePassword: admin.mustChangePassword }, ip: requestIp(request), userAgent: requestAgent(request) });
    this.sockets.emitToAdmins('staff_session_revoked', { staffId: id, reason: 'password_reset' });
    return { staff: await this.findOne(id), passwordReset: true, mustChangePassword: admin.mustChangePassword };
  }

  async accessPreview(dto: AccessPreviewDto, actorId: string) {
    const actor = await this.actor(actorId);
    const actorOwner = this.isOwner(actor);
    const roleIds = [...new Set(dto.roleIds ?? [])];
    const roles = roleIds.length ? await this.prisma.role.findMany({ where: { id: { in: roleIds }, isActive: true } }) : [];
    if (roles.length !== roleIds.length) throw new AppException('One or more roles were not found or are inactive', 'INVALID_ROLE');
    const rolePermissions = roles.flatMap((role) => role.permissionKeys);
    await this.validateAssignable([...rolePermissions, ...(dto.directGrantKeys ?? [])], actorId, actorOwner);
    const grants = this.validateKeys(dto.directGrantKeys);
    const denies = this.validateKeys(dto.directDenyKeys);
    const effectivePermissions = [...new Set([...rolePermissions, ...grants].filter((key) => !denies.includes(key)))].sort();
    return {
      effectivePermissions,
      dangerousPermissions: effectivePermissions.filter((key) => catalogItems.find((item) => item.key === key)?.dangerous),
      ownerOnlyRejected: [...new Set([...rolePermissions, ...grants, ...denies].filter((key) => ownerOnlyKeys.has(key)))].filter(() => !actorOwner),
      conflicts: denies.filter((key) => grants.includes(key)),
      roleIds,
      directGrants: grants,
      directDenies: denies,
    };
  }

  async updateAccess(id: string, dto: StaffAccessDto, actorId: string, request: Request) {
    const { target, actorOwner } = await this.assertTargetAccess(actorId, id);
    if (this.isOwner(target)) throw new AppException('Owner access is protected and cannot be replaced', 'OWNER_PROTECTED', 403);
    const roleIds = [...new Set(dto.roleIds ?? [])];
    const roles = roleIds.length ? await this.prisma.role.findMany({ where: { id: { in: roleIds }, isActive: true } }) : [];
    if (roles.length !== roleIds.length) throw new AppException('One or more roles were not found or are inactive', 'INVALID_ROLE');
    const rolePermissions = roles.flatMap((role) => role.permissionKeys);
    await this.validateAssignable([...rolePermissions, ...(dto.directGrantKeys ?? [])], actorId, actorOwner);
    const grants = this.validateKeys(dto.directGrantKeys);
    const denies = this.validateKeys(dto.directDenyKeys);
    if (!actorOwner && denies.some((key) => ownerOnlyKeys.has(key))) throw new AppException('Owner-only permissions cannot be denied', 'OWNER_ONLY_PERMISSION', 403);
    const before = { roleIds: target.roleAssignments.map((assignment) => assignment.roleId), grants: target.permissions, denies: target.deniedPermissions };
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.adminUserRole.deleteMany({ where: { adminUserId: id } });
      if (roleIds.length) await tx.adminUserRole.createMany({ data: roleIds.map((roleId) => ({ adminUserId: id, roleId })), skipDuplicates: true });
      return tx.adminUser.update({ where: { id }, data: { permissions: grants, deniedPermissions: denies, tokenVersion: { increment: 1 } } });
    });
    const effectivePermissions = await this.permissionResolver.forAdmin(id);
    await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId, action: 'STAFF_ACCESS_UPDATED', entityType: 'AdminUser', entityId: id, metadata: { before, after: { roleIds, grants, denies }, effectivePermissions }, ip: requestIp(request), userAgent: requestAgent(request) });
    this.sockets.emitToAdmins('staff_access_changed', { staffId: id });
    return { staff: await this.findOne(updated.id), effectivePermissions };
  }

  async createSession(adminId: string, input: { id?: string; refreshTokenHash: string; deviceName?: string; platform?: string; appVersion?: string; ip?: string; userAgent?: string | string[] }) {
    return this.prisma.adminSession.create({ data: { id: input.id, adminUserId: adminId, refreshTokenHash: input.refreshTokenHash, deviceName: input.deviceName?.slice(0, 120), platform: input.platform?.slice(0, 60), appVersion: input.appVersion?.slice(0, 60), ipAddress: safeIp(input.ip), userAgentSummary: safeAgent(input.userAgent), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
  }

  async listSessions(targetId: string, currentSessionId?: string) {
    const sessions = await this.prisma.adminSession.findMany({ where: { adminUserId: targetId }, orderBy: [{ revokedAt: 'asc' }, { lastUsedAt: 'desc' }, { id: 'asc' }] });
    return sessions.map((session) => ({ id: session.id, deviceName: session.deviceName, platform: session.platform, appVersion: session.appVersion, ipAddress: session.ipAddress, userAgentSummary: session.userAgentSummary, createdAt: session.createdAt, lastUsedAt: session.lastUsedAt, expiresAt: session.expiresAt, revokedAt: session.revokedAt, isCurrent: session.id === currentSessionId && !session.revokedAt }));
  }

  async revokeSession(targetId: string, sessionId: string, actorId: string, request: Request) {
    const { target } = await this.assertTargetAccess(actorId, targetId);
    const session = await this.prisma.adminSession.findFirst({ where: { id: sessionId, adminUserId: targetId } });
    if (!session) throw new AppException('Session was not found', 'SESSION_NOT_FOUND', 404);
    await this.prisma.adminSession.update({ where: { id: sessionId }, data: { revokedAt: session.revokedAt ?? new Date() } });
    await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId, action: 'SESSION_REVOKED', entityType: 'AdminSession', entityId: sessionId, metadata: { targetStaffId: target.id }, ip: requestIp(request), userAgent: requestAgent(request) });
    this.sockets.emitToAdmins('staff_session_revoked', { staffId: targetId, sessionId });
    return { revoked: true, sessionId };
  }

  async revokeAllSessions(targetId: string, actorId: string, request: Request) {
    const { target } = await this.assertTargetAccess(actorId, targetId);
    await this.prisma.$transaction([
      this.prisma.adminSession.updateMany({ where: { adminUserId: targetId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.adminUser.update({ where: { id: targetId }, data: { refreshTokenHash: null, tokenVersion: { increment: 1 } } }),
    ]);
    await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId, action: 'ALL_SESSIONS_REVOKED', entityType: 'AdminUser', entityId: targetId, metadata: { targetStaffId: target.id }, ip: requestIp(request), userAgent: requestAgent(request) });
    this.sockets.emitToAdmins('staff_session_revoked', { staffId: targetId, all: true });
    return { revoked: true, all: true };
  }

  async changeOwnPassword(adminId: string, currentPassword: string, newPassword: string, currentSessionId: string | undefined, request: Request) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw new AppException('Staff account was not found', 'STAFF_NOT_FOUND', HttpStatus.UNAUTHORIZED);
    const currentValid = await this.passwordService.verify(admin.passwordHash, currentPassword);
    if (!currentValid) throw new AppException('Current password is invalid', 'CURRENT_PASSWORD_INVALID', HttpStatus.UNAUTHORIZED);
    assertPasswordPolicy(newPassword, currentPassword);
    const passwordHash = await this.passwordService.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id: adminId }, data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false, refreshTokenHash: null } });
      await tx.adminSession.updateMany({ where: { adminUserId: adminId, revokedAt: null, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) }, data: { revokedAt: new Date() } });
    });
    await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId: adminId, action: 'STAFF_PASSWORD_CHANGED', entityType: 'AdminUser', entityId: adminId, metadata: { mandatoryChange: admin.mustChangePassword, currentSessionPreserved: Boolean(currentSessionId) }, ip: requestIp(request), userAgent: requestAgent(request) });
    return { passwordChanged: true, mustChangePassword: false, otherSessionsRevoked: true };
  }
}
