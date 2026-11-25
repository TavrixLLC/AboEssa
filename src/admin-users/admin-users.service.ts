import { Injectable } from '@nestjs/common';
import { ActorType, AdminRole, Prisma } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { OWNER_PERMISSIONS } from 'src/common/constants/permissions.constants';
import { AppException } from 'src/common/exceptions/app.exception';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { PasswordService } from 'src/common/security/password.service';
import { assertPasswordPolicy } from 'src/common/security/password-policy';
import { toSafeAdminUser } from 'src/common/utils/safe-user.util';
import { withoutRetiredPermissions } from 'src/permissions/permission-resolution';
import { AdminUserQueryDto } from 'src/admin-users/dto/admin-user-query.dto';
import { CreateAdminUserDto } from 'src/admin-users/dto/create-admin-user.dto';
import { UpdateAdminUserDto } from 'src/admin-users/dto/update-admin-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(dto: CreateAdminUserDto, actorId: string, request: Request) {
    assertPasswordPolicy(dto.password);
    const actor = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: actorId } });
    if (dto.role === AdminRole.OWNER && !(actor.isOwner || actor.role === AdminRole.OWNER)) throw new AppException('Only an owner can create another owner', 'OWNER_PROTECTED', 403);
    const normalizedEmail = dto.email.trim().toLowerCase();
    const admin = await this.prisma.adminUser.create({
      data: {
        name: dto.name,
        displayName: dto.name,
        email: normalizedEmail,
        normalizedEmail,
        passwordHash: await this.passwordService.hash(dto.password),
        role: dto.role,
        permissions: dto.role === AdminRole.OWNER ? OWNER_PERMISSIONS : withoutRetiredPermissions(dto.permissions),
        isOwner: dto.role === AdminRole.OWNER,
        isActive: dto.isActive ?? true,
        status: dto.isActive === false ? 'INACTIVE' : 'ACTIVE',
        mustChangePassword: dto.role !== AdminRole.OWNER,
      },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId,
      action: 'admin_user.created',
      entityType: 'AdminUser',
      entityId: admin.id,
      metadata: { email: admin.email, role: admin.role },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return toSafeAdminUser(admin);
  }

  async findAll(query: AdminUserQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.AdminUserWhereInput = {
      role: query.role,
      isActive: query.isActive,
      normalizedEmail: query.email ? query.email.toLowerCase() : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminUser.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.adminUser.count({ where }),
    ]);

    return toPaginatedResult(
      items.map((admin) => toSafeAdminUser(admin)),
      total,
      pagination.page,
      pagination.limit,
    );
  }

  async findOne(id: string) {
    return toSafeAdminUser(await this.prisma.adminUser.findUniqueOrThrow({ where: { id } }));
  }

  async update(id: string, dto: UpdateAdminUserDto, actorId: string, request: Request) {
    const existing = await this.prisma.adminUser.findUniqueOrThrow({ where: { id } });
    const actor = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: actorId } });
    const targetOwner = existing.isOwner || existing.role === AdminRole.OWNER;
    const actorOwner = actor.isOwner || actor.role === AdminRole.OWNER;
    if (targetOwner && !actorOwner) throw new AppException('Owner account is protected', 'OWNER_PROTECTED', 403);
    if (targetOwner && dto.role && dto.role !== AdminRole.OWNER) throw new AppException('Owner status cannot be removed', 'OWNER_PROTECTED', 403);
    if (dto.isActive === false && id === actorId) throw new AppException('You cannot deactivate your own account', 'CANNOT_DEACTIVATE_SELF', 403);
    if (targetOwner && dto.isActive === false) {
      const activeOwners = await this.prisma.adminUser.count({ where: { isOwner: true, status: 'ACTIVE', isActive: true } });
      if (activeOwners <= 1) throw new AppException('At least one active owner must remain', 'LAST_ACTIVE_OWNER', 403);
    }
    if (dto.password) assertPasswordPolicy(dto.password);
    const data: Prisma.AdminUserUpdateInput = {
      name: dto.name,
      displayName: dto.name,
      email: dto.email?.toLowerCase(),
      normalizedEmail: dto.email?.toLowerCase(),
      role: dto.role,
      permissions:
        dto.role === AdminRole.OWNER
          ? OWNER_PERMISSIONS
          : dto.permissions === undefined
            ? undefined
            : withoutRetiredPermissions(dto.permissions),
      isOwner: dto.role === AdminRole.OWNER ? true : undefined,
      isActive: dto.isActive,
      status: dto.isActive === false ? 'INACTIVE' : dto.isActive === true ? 'ACTIVE' : undefined,
      passwordHash: dto.password ? await this.passwordService.hash(dto.password) : undefined,
      passwordChangedAt: dto.password ? new Date() : undefined,
      tokenVersion: dto.password || dto.isActive === false ? { increment: 1 } : undefined,
      refreshTokenHash: dto.password || dto.isActive === false ? null : undefined,
    };

    const admin = await this.prisma.adminUser.update({ where: { id }, data });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId,
      action: 'admin_user.updated',
      entityType: 'AdminUser',
      entityId: id,
      metadata: { role: dto.role, isActive: dto.isActive },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return toSafeAdminUser(admin);
  }
}
