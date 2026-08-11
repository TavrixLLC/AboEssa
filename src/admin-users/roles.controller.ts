import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RolesService } from 'src/admin-users/roles.service';
import { CreateRoleDto, UpdateRoleDto } from 'src/admin-users/dto/staff-phase-e.dto';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('admin/roles')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get() @Permissions(PERMISSIONS.ROLES_VIEW) @ApiOperation({ summary: 'List reusable staff roles' }) findAll() { return this.roles.findAll(); }
  @Post() @Permissions(PERMISSIONS.ROLES_CREATE) create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.roles.create(dto, user.id, request); }
  @Get(':id') @Permissions(PERMISSIONS.ROLES_VIEW) findOne(@Param('id') id: string) { return this.roles.findOne(id); }
  @Patch(':id') @Permissions(PERMISSIONS.ROLES_EDIT) update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.roles.update(id, dto, user.id, request); }
}
