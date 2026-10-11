import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { CreatePairingChallengeDto } from 'src/screens/dto/create-pairing-challenge.dto';
import { PairScreenDto } from 'src/screens/dto/pair-screen.dto';
import { PairingStatusDto } from 'src/screens/dto/pairing-status.dto';
import { RenameScreenDto } from 'src/screens/dto/rename-screen.dto';
import { ScreensService } from 'src/screens/screens.service';

@ApiTags('Screens')
@Controller()
export class ScreensController {
  constructor(private readonly screensService: ScreensService) {}

  @Post('screens/pairing/challenges')
  @Public()
  @ApiOperation({ summary: 'Create a short-lived one-time TV pairing challenge' })
  createPairingChallenge(@Body() dto: CreatePairingChallengeDto) {
    return this.screensService.createPairingChallenge(dto);
  }

  @Post('screens/pairing/challenges/:id/status')
  @Public()
  @ApiOperation({ summary: 'Poll pairing status and deliver the display credential once' })
  pairingStatus(@Param('id') id: string, @Body() dto: PairingStatusDto) {
    return this.screensService.pairingStatus(id, dto);
  }

  @Post('admin/screens/pair')
  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SCREENS_MANAGE)
  @ApiOperation({ summary: 'Authorize a scanned TV pairing challenge' })
  pair(
    @Body() dto: PairScreenDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.screensService.pair(dto, user.id, request);
  }

  @Get('admin/screens')
  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SCREENS_MANAGE)
  @ApiOperation({ summary: 'List display devices without credential material' })
  findAll() {
    return this.screensService.findAll();
  }

  @Patch('admin/screens/:id/revoke')
  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SCREENS_MANAGE)
  @ApiOperation({ summary: 'Revoke a display device credential' })
  revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.screensService.revoke(id, user.id, request);
  }

  @Patch('admin/screens/:id/rename')
  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SCREENS_MANAGE)
  @ApiOperation({ summary: 'Rename a display device' })
  rename(
    @Param('id') id: string,
    @Body() dto: RenameScreenDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.screensService.rename(id, dto, user.id, request);
  }

  @Get('screens/me')
  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Screen)
  @ApiOperation({ summary: 'Validate the current display device session' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.screensService.me(user.id);
  }

  @Post('screens/me/revoke')
  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Screen)
  @ApiOperation({ summary: 'Revoke the current display during a local reset' })
  revokeMe(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.screensService.revokeSelf(user.id, request);
  }

  @Get('screens/quick-sales/recent')
  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Screen)
  @ApiOperation({ summary: 'Get the authoritative recent Quick Sale display feed' })
  recentQuickSales(@CurrentUser() user: AuthenticatedUser) {
    return this.screensService.recentQuickSales(user.id);
  }
}
