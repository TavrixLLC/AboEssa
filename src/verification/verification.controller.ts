import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { ReviewCustomerDto } from 'src/customers/dto/review-customer.dto';
import { CreateVerificationRequestDto } from 'src/verification/dto/create-verification-request.dto';
import { VerificationQueryDto } from 'src/verification/dto/verification-query.dto';
import { VerificationService } from 'src/verification/verification.service';

@ApiTags('Verification')
@Controller()
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('customer/verification/request')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  @ApiBearerAuth()
  requestVerification(
    @Body() dto: CreateVerificationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.verificationService.requestVerification(user.id, dto, request);
  }

  @Get('admin/verification/requests')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.CUSTOMERS_VERIFY)
  @ApiBearerAuth()
  findAll(@Query() query: VerificationQueryDto) {
    return this.verificationService.findAll(query);
  }

  @Get('admin/verification/requests/:id')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.CUSTOMERS_VERIFY)
  @ApiBearerAuth()
  findOne(@Param('id') id: string) {
    return this.verificationService.findOne(id);
  }

  @Post('admin/verification/requests/:id/approve')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.CUSTOMERS_VERIFY)
  @ApiBearerAuth()
  approve(
    @Param('id') id: string,
    @Body() dto: ReviewCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.verificationService.review(id, VerificationStatus.VERIFIED, dto.note, user.id, request);
  }

  @Post('admin/verification/requests/:id/reject')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.CUSTOMERS_VERIFY)
  @ApiBearerAuth()
  reject(
    @Param('id') id: string,
    @Body() dto: ReviewCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.verificationService.review(id, VerificationStatus.REJECTED, dto.note, user.id, request);
  }
}

