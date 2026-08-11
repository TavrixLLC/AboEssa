import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminAuthService } from 'src/admin-auth/admin-auth.service';
import { AdminLoginDto } from 'src/admin-auth/dto/admin-login.dto';
import { AuthRefreshDto } from 'src/admin-auth/dto/auth-refresh.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { AllowMandatoryPasswordChange } from 'src/common/decorators/mandatory-password-change.decorator';
import { ChangePasswordDto } from 'src/admin-auth/dto/change-password.dto';
import { StaffService } from 'src/admin-users/staff.service';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';

@ApiTags('Admin auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService, private readonly staffService: StaffService) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Admin login with email and password' })
  login(@Body() dto: AdminLoginDto, @Req() request: Request) {
    return this.adminAuthService.login(dto, request);
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Rotate admin refresh token' })
  refresh(@Body() dto: AuthRefreshDto, @Req() request: Request) {
    return this.adminAuthService.refresh(dto.refreshToken, request);
  }

  @Post('logout')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @AllowMandatoryPasswordChange()
  logout(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.adminAuthService.logout(user.id, request);
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @AllowMandatoryPasswordChange()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.adminAuthService.me(user.id);
  }

  @Post('change-password')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @AllowMandatoryPasswordChange()
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.adminAuthService.changePassword(user.id, dto.currentPassword, dto.newPassword, request, user.sessionId);
  }

  @Get('sessions')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @AllowMandatoryPasswordChange()
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.staffService.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @AllowMandatoryPasswordChange()
  revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string, @Req() request: Request) {
    return this.staffService.revokeSession(user.id, sessionId, user.id, request);
  }

  @Delete('sessions')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @AllowMandatoryPasswordChange()
  revokeAllSessions(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.staffService.revokeAllSessions(user.id, user.id, request);
  }
}
