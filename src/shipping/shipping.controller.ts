import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { CreateShippingRequestDto } from 'src/shipping/dto/create-shipping-request.dto';
import { ShipRequestDto } from 'src/shipping/dto/ship-request.dto';
import { ShippingService } from 'src/shipping/shipping.service';

@ApiTags('Shipping')
@ApiBearerAuth()
@Controller()
export class ShippingController {
  constructor(
    private readonly shippingService: ShippingService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('customer/shipping-requests')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateShippingRequestDto,
    @Req() request: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const key = this.idempotencyService.requireKey(headers);
    const endpoint = `${request.method}:${request.path}`;
    const requestHash = this.idempotencyService.hashBody(dto);
    const replay = await this.idempotencyService.getReplayOrThrowConflict({
      key,
      actorType: ActorType.CUSTOMER,
      actorId: user.id,
      endpoint,
      requestHash,
    });
    if (replay) return replay;
    const response = await this.shippingService.createRequest(user.id, dto, request);
    await this.idempotencyService.store({
      key,
      actorType: ActorType.CUSTOMER,
      actorId: user.id,
      endpoint,
      requestHash,
      responseJson: response,
      statusCode: 201,
      expiresAt: this.idempotencyService.getExpiryDate(),
    });
    return response;
  }

  @Get('customer/shipping-requests')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  listCustomer(@CurrentUser() user: AuthenticatedUser) { return this.shippingService.listCustomer(user.id); }

  @Get('customer/shipping-requests/:id')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  getCustomer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.shippingService.getCustomer(user.id, id); }

  @Get('admin/shipping-requests')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SHIPPING_MANAGE)
  adminList() { return this.shippingService.adminList(); }

  @Get('admin/shipping-requests/:id')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SHIPPING_MANAGE)
  adminGet(@Param('id') id: string) { return this.shippingService.adminGet(id); }

  @Post('admin/shipping-requests/:id/approve')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SHIPPING_MANAGE)
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.shippingService.approve(id, user.id, request);
  }

  @Post('admin/shipping-requests/:id/pack')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SHIPPING_MANAGE)
  pack(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.shippingService.pack(id, user.id, request);
  }

  @Post('admin/shipping-requests/:id/ship')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SHIPPING_MANAGE)
  ship(@Param('id') id: string, @Body() dto: ShipRequestDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.shippingService.ship(id, dto, user.id, request);
  }

  @Post('admin/shipping-requests/:id/cancel')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.SHIPPING_MANAGE)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.shippingService.cancel(id, user.id, request);
  }
}

