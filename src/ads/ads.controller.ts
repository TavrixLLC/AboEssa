import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdsService } from 'src/ads/ads.service';
import { AdQueryDto } from 'src/ads/dto/ad-query.dto';
import { CreateAdDto } from 'src/ads/dto/create-ad.dto';
import { UpdateAdDto } from 'src/ads/dto/update-ad.dto';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';

@ApiTags('Ads')
@Controller()
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  @Post('admin/ads')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.ADS_MANAGE)
  @ApiBearerAuth()
  create(
    @Body() dto: CreateAdDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adsService.create(dto, user.id, request);
  }

  @Get('admin/ads')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  adminList(@Query() query: AdQueryDto) {
    return this.adsService.adminList(query);
  }

  @Get('admin/ads/:id')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  get(@Param('id') id: string) {
    return this.adsService.get(id);
  }

  @Patch('admin/ads/:id')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.ADS_MANAGE)
  @ApiBearerAuth()
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adsService.update(id, dto, user.id, request);
  }

  @Patch('admin/ads/:id/deactivate')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.ADS_MANAGE)
  @ApiBearerAuth()
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adsService.deactivate(id, user.id, request);
  }

  @Get('ads')
  @Public()
  customerAds(@Query() query: AdQueryDto) {
    return this.adsService.customerAds(query);
  }
}
