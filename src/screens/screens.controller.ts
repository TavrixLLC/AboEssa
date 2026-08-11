import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { CreateScreenDto } from 'src/screens/dto/create-screen.dto';
import { RenameScreenDto } from 'src/screens/dto/rename-screen.dto';
import { ScreensService } from 'src/screens/screens.service';

@ApiTags('Screens')
@ApiBearerAuth()
@Controller()
export class ScreensController {
  constructor(private readonly screensService: ScreensService) {}

  @Post('admin/screens')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SCREENS_MANAGE)
  @ApiOperation({ summary: 'Create a screen device and token' })
  create(@Body() dto: CreateScreenDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.screensService.create(dto, user.id, request);
  }

  @Get('admin/screens')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SCREENS_MANAGE)
  @ApiOperation({ summary: 'List screen devices' })
  findAll() {
    return this.screensService.findAll();
  }

  @Patch('admin/screens/:id/revoke')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SCREENS_MANAGE)
  @ApiOperation({ summary: 'Revoke a screen device token' })
  revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.screensService.revoke(id, user.id, request);
  }

  @Patch('admin/screens/:id/rename')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SCREENS_MANAGE)
  @ApiOperation({ summary: 'Rename a screen device' })
  rename(
    @Param('id') id: string,
    @Body() dto: RenameScreenDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.screensService.rename(id, dto, user.id, request);
  }

  @Get('screens/me')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Screen)
  @ApiOperation({ summary: 'Get current screen device' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.screensService.me(user.id);
  }
}

