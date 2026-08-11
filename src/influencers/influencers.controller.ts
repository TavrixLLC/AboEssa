import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CommissionStatus } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CommissionQueryDto } from 'src/commissions/dto/commission-query.dto';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { CreateInfluencerDto } from 'src/influencers/dto/create-influencer.dto';
import { UpdateInfluencerDto } from 'src/influencers/dto/update-influencer.dto';
import { InfluencersService } from 'src/influencers/influencers.service';
import { CreateReferralCodeDto } from 'src/referral-codes/dto/create-referral-code.dto';
import { UpdateReferralCodeDto } from 'src/referral-codes/dto/update-referral-code.dto';

@ApiTags('Influencers, referrals, commissions')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
export class InfluencersController {
  constructor(private readonly influencersService: InfluencersService) {}

  @Post('influencers')
  @Permissions(PERMISSIONS.INFLUENCERS_MANAGE)
  createInfluencer(@Body() dto: CreateInfluencerDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.influencersService.createInfluencer(dto, user.id, request);
  }

  @Get('influencers')
  @Permissions(PERMISSIONS.INFLUENCERS_MANAGE)
  listInfluencers() { return this.influencersService.listInfluencers(); }

  @Get('influencers/:id')
  @Permissions(PERMISSIONS.INFLUENCERS_MANAGE)
  getInfluencer(@Param('id') id: string) { return this.influencersService.getInfluencer(id); }

  @Patch('influencers/:id')
  @Permissions(PERMISSIONS.INFLUENCERS_MANAGE)
  updateInfluencer(@Param('id') id: string, @Body() dto: UpdateInfluencerDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.influencersService.updateInfluencer(id, dto, user.id, request);
  }

  @Patch('influencers/:id/deactivate')
  @Permissions(PERMISSIONS.INFLUENCERS_MANAGE)
  deactivateInfluencer(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.influencersService.deactivateInfluencer(id, user.id, request);
  }

  @Post('referral-codes')
  @Permissions(PERMISSIONS.INFLUENCERS_MANAGE)
  createReferralCode(@Body() dto: CreateReferralCodeDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.influencersService.createReferralCode(dto, user.id, request);
  }

  @Get('referral-codes')
  @Permissions(PERMISSIONS.INFLUENCERS_MANAGE)
  listReferralCodes() { return this.influencersService.listReferralCodes(); }

  @Get('referral-codes/:id')
  @Permissions(PERMISSIONS.INFLUENCERS_MANAGE)
  getReferralCode(@Param('id') id: string) { return this.influencersService.getReferralCode(id); }

  @Patch('referral-codes/:id')
  @Permissions(PERMISSIONS.INFLUENCERS_MANAGE)
  updateReferralCode(@Param('id') id: string, @Body() dto: UpdateReferralCodeDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.influencersService.updateReferralCode(id, dto, user.id, request);
  }

  @Patch('referral-codes/:id/deactivate')
  @Permissions(PERMISSIONS.INFLUENCERS_MANAGE)
  deactivateReferralCode(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.influencersService.deactivateReferralCode(id, user.id, request);
  }

  @Get('commissions')
  @Permissions(PERMISSIONS.COMMISSIONS_MANAGE)
  commissions(@Query() query: CommissionQueryDto) { return this.influencersService.commissions(query); }

  @Get('influencers/:id/commissions')
  @Permissions(PERMISSIONS.COMMISSIONS_MANAGE)
  influencerCommissions(@Param('id') id: string, @Query() query: CommissionQueryDto) {
    return this.influencersService.influencerCommissions(id, query);
  }

  @Get('influencers/:id/report')
  @Permissions(PERMISSIONS.REPORTS_READ)
  influencerReport(@Param('id') id: string) { return this.influencersService.influencerReport(id); }

  @Post('commissions/:id/approve')
  @Permissions(PERMISSIONS.COMMISSIONS_MANAGE)
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.influencersService.setCommissionStatus(id, CommissionStatus.APPROVED, user.id, request);
  }

  @Post('commissions/:id/mark-paid')
  @Permissions(PERMISSIONS.COMMISSIONS_MANAGE)
  markPaid(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.influencersService.setCommissionStatus(id, CommissionStatus.PAID, user.id, request);
  }

  @Post('commissions/:id/cancel')
  @Permissions(PERMISSIONS.COMMISSIONS_MANAGE)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.influencersService.setCommissionStatus(id, CommissionStatus.CANCELLED, user.id, request);
  }
}

