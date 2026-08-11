import { Injectable } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { CategoryQueryDto } from 'src/categories/dto/category-query.dto';
import { CreateCategoryDto } from 'src/categories/dto/create-category.dto';
import { UpdateCategoryDto } from 'src/categories/dto/update-category.dto';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { toSlug } from 'src/common/utils/slug.util';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(dto: CreateCategoryDto, adminId: string, request: Request) {
    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug ? toSlug(dto.slug) : toSlug(dto.name),
        icon: dto.icon,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'category.created',
      entityType: 'Category',
      entityId: category.id,
      metadata: dto as unknown as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return category;
  }

  async findAll(query: CategoryQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.CategoryWhereInput = {
      isActive: query.isActive,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.category.count({ where }),
    ]);

    return toPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  findOne(id: string) {
    return this.prisma.category.findUniqueOrThrow({ where: { id } });
  }

  async update(id: string, dto: UpdateCategoryDto, adminId: string, request: Request) {
    const category = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug ? toSlug(dto.slug) : undefined,
        icon: dto.icon,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'category.updated',
      entityType: 'Category',
      entityId: category.id,
      metadata: dto as unknown as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return category;
  }

  async deactivate(id: string, adminId: string, request: Request) {
    const category = await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'category.deactivated',
      entityType: 'Category',
      entityId: category.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return category;
  }
}
