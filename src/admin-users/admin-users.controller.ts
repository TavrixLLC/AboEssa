import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminUsersService } from 'src/admin-users/admin-users.service';
import { AdminUserQueryDto } from 'src/admin-users/dto/admin-user-query.dto';
import { CreateAdminUserDto } from 'src/admin-users/dto/create-admin-user.dto';
import { UpdateAdminUserDto } from 'src/admin-users/dto/update-admin-user.dto';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';

@ApiTags('Admin users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
@Permissions(PERMISSIONS.ADMIN_USERS_MANAGE)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Post()
  create(
    @Body() dto: CreateAdminUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminUsersService.create(dto, user.id, request);
  }

  @Get()
  findAll(@Query() query: AdminUserQueryDto) {
    return this.adminUsersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminUsersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminUsersService.update(id, dto, user.id, request);
  }
}

