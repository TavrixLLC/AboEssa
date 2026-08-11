import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CategoriesService } from 'src/categories/categories.service';
import { CategoryQueryDto } from 'src/categories/dto/category-query.dto';
import { CreateCategoryDto } from 'src/categories/dto/create-category.dto';
import { UpdateCategoryDto } from 'src/categories/dto/update-category.dto';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';

@ApiTags('Categories')
@Controller()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('categories')
  @Public()
  publicList(@Query() query: CategoryQueryDto) {
    return this.categoriesService.findAll({ ...query, isActive: true });
  }

  @Get('categories/:id')
  @Public()
  publicOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Get('admin/categories')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  adminList(@Query() query: CategoryQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @Post('admin/categories')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.CATEGORIES_MANAGE)
  @ApiBearerAuth()
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.categoriesService.create(dto, user.id, request);
  }

  @Get('admin/categories/:id')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  adminOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch('admin/categories/:id')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.CATEGORIES_MANAGE)
  @ApiBearerAuth()
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.categoriesService.update(id, dto, user.id, request);
  }

  @Patch('admin/categories/:id/deactivate')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.CATEGORIES_MANAGE)
  @ApiBearerAuth()
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.categoriesService.deactivate(id, user.id, request);
  }
}

