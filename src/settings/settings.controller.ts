import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { UpdateAppSettingsDto } from 'src/settings/dto/update-app-settings.dto';
import { SettingsService } from 'src/settings/settings.service';

@ApiTags('Settings')
@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('settings')
  @Public()
  getPublicSettings() {
    return this.settingsService.getSettings();
  }

  @Get('admin/settings')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  getAdminSettings() {
    return this.settingsService.getSettings();
  }

  @Patch('admin/settings')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiBearerAuth()
  updateSettings(
    @Body() dto: UpdateAppSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.settingsService.updateSettings(dto, user.id, request);
  }
}

