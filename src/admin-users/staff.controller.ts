import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RolesService } from 'src/admin-users/roles.service';
import { StaffService } from 'src/admin-users/staff.service';
import { AccessPreviewDto, CreateStaffDto, ResetStaffPasswordDto, StaffAccessDto, StaffQueryDto, SessionQueryDto, UpdateStaffProfileDto } from 'src/admin-users/dto/staff-phase-e.dto';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('admin/staff')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get() @Permissions(PERMISSIONS.STAFF_VIEW) @ApiOperation({ summary: 'List staff accounts' }) findAll(@Query() query: StaffQueryDto) { return this.staff.findAll(query); }
  @Post() @Permissions(PERMISSIONS.STAFF_CREATE) @ApiOperation({ summary: 'Create a staff account with a one-time temporary password input' }) create(@Body() dto: CreateStaffDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.staff.create(dto, user.id, request); }
  @Post('access-preview') @Permissions(PERMISSIONS.STAFF_MANAGE_PERMISSIONS) preview(@Body() dto: AccessPreviewDto, @CurrentUser() user: AuthenticatedUser) { return this.staff.accessPreview(dto, user.id); }
  @Get(':id') @Permissions(PERMISSIONS.STAFF_VIEW) findOne(@Param('id') id: string) { return this.staff.findOne(id); }
  @Patch(':id') @Permissions(PERMISSIONS.STAFF_EDIT) updateProfile(@Param('id') id: string, @Body() dto: UpdateStaffProfileDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.staff.updateProfile(id, dto, user.id, request); }
  @Put(':id/access') @Permissions(PERMISSIONS.STAFF_MANAGE_PERMISSIONS) updateAccess(@Param('id') id: string, @Body() dto: StaffAccessDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.staff.updateAccess(id, dto, user.id, request); }
  @Post(':id/reset-password') @Permissions(PERMISSIONS.STAFF_RESET_PASSWORD) resetPassword(@Param('id') id: string, @Body() dto: ResetStaffPasswordDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.staff.resetPassword(id, dto, user.id, request); }
  @Post(':id/activate') @Permissions(PERMISSIONS.STAFF_ACTIVATE) activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.staff.setStatus(id, 'ACTIVE' as any, user.id, request); }
  @Post(':id/deactivate') @Permissions(PERMISSIONS.STAFF_DEACTIVATE) deactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.staff.setStatus(id, 'INACTIVE' as any, user.id, request); }
  @Post(':id/lock') @Permissions(PERMISSIONS.STAFF_LOCK) lock(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.staff.setStatus(id, 'LOCKED' as any, user.id, request); }
  @Post(':id/unlock') @Permissions(PERMISSIONS.STAFF_UNLOCK) unlock(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.staff.setStatus(id, 'ACTIVE' as any, user.id, request); }
  @Get(':id/sessions') @Permissions(PERMISSIONS.STAFF_MANAGE_SESSIONS) sessions(@Param('id') id: string, @Query() _query: SessionQueryDto) { return this.staff.listSessions(id); }
  @Delete(':id/sessions/:sessionId') @Permissions(PERMISSIONS.STAFF_MANAGE_SESSIONS) revokeSession(@Param('id') id: string, @Param('sessionId') sessionId: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.staff.revokeSession(id, sessionId, user.id, request); }
  @Delete(':id/sessions') @Permissions(PERMISSIONS.STAFF_MANAGE_SESSIONS) revokeAllSessions(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.staff.revokeAllSessions(id, user.id, request); }
}
