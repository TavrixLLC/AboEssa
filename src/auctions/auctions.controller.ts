import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ActorType } from '@prisma/client';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuctionsService } from 'src/auctions/auctions.service';
import { CheckoutDto } from 'src/checkout/dto/checkout.dto';
import { AuctionQueryDto } from 'src/auctions/dto/auction-query.dto';
import {
  AuctionListResponseDto,
  AuctionResponseDto,
  BidResponseDto,
  PlaceBidResultDto,
} from 'src/auctions/dto/auction-response.dto';
import { CreateAuctionDto } from 'src/auctions/dto/create-auction.dto';
import { PlaceBidDto } from 'src/auctions/dto/place-bid.dto';
import { UpdateAuctionDto } from 'src/auctions/dto/update-auction.dto';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { OptionalJwtAccessGuard } from 'src/common/guards/optional-jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';
import { successEnvelopeSchema } from 'src/common/swagger/response-envelope.schema';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';

@ApiTags('Auctions')
@ApiExtraModels(AuctionResponseDto, AuctionListResponseDto, BidResponseDto, PlaceBidResultDto)
@Controller()
export class AuctionsController {
  constructor(
    private readonly auctionsService: AuctionsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('admin/auctions')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.AUCTIONS_MANAGE)
  @ApiBearerAuth()
  @ApiCreatedResponse({ schema: successEnvelopeSchema(AuctionResponseDto) })
  create(
    @Body() dto: CreateAuctionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.auctionsService.create(dto, user.id, request, user);
  }

  @Get('admin/auctions')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @ApiOkResponse({ schema: successEnvelopeSchema(AuctionListResponseDto) })
  adminList(@Query() query: AuctionQueryDto) {
    return this.auctionsService.findAll(query);
  }

  @Get('admin/auctions/:id')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @ApiOkResponse({ schema: successEnvelopeSchema(AuctionResponseDto) })
  adminOne(@Param('id') id: string) {
    return this.auctionsService.findOne(id);
  }

  @Get('admin/auctions/:id/bids')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @ApiOkResponse({ schema: successEnvelopeSchema([BidResponseDto]) })
  bids(@Param('id') id: string) {
    return this.auctionsService.bids(id);
  }

  @Patch('admin/auctions/:id')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.AUCTIONS_MANAGE)
  @ApiBearerAuth()
  @ApiOkResponse({ schema: successEnvelopeSchema(AuctionResponseDto) })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAuctionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.auctionsService.update(id, dto, user.id, request, user);
  }

  @Post('admin/auctions/:id/publish')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.AUCTIONS_MANAGE)
  @ApiBearerAuth()
  @ApiCreatedResponse({ schema: successEnvelopeSchema(AuctionResponseDto) })
  publish(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.auctionsService.publish(id, user.id, request);
  }

  @Post('admin/auctions/:id/cancel')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.AUCTIONS_MANAGE)
  @ApiBearerAuth()
  @ApiCreatedResponse({ schema: successEnvelopeSchema(AuctionResponseDto) })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.auctionsService.cancel(id, user.id, request);
  }

  @Post('admin/auctions/:id/close-now')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.AUCTIONS_MANAGE)
  @ApiBearerAuth()
  @ApiCreatedResponse({ schema: successEnvelopeSchema(AuctionResponseDto) })
  closeNow(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctionsService.closeNow(id, user.id);
  }

  @Get('auctions')
  @UseGuards(OptionalJwtAccessGuard)
  @ApiOkResponse({ schema: successEnvelopeSchema(AuctionListResponseDto) })
  list(@Query() query: AuctionQueryDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.auctionsService.findAll(query, true, this.customerId(user));
  }

  @Get('auctions/:id')
  @UseGuards(OptionalJwtAccessGuard)
  @ApiOkResponse({ schema: successEnvelopeSchema(AuctionResponseDto) })
  one(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.auctionsService.findOne(id, true, this.customerId(user));
  }

  @Get('auctions/wins/pending')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List won auctions awaiting checkout' })
  pendingWins(@CurrentUser() user: AuthenticatedUser) {
    return this.auctionsService.pendingWins(user.id);
  }

  @Post('auctions/:id/checkout')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Choose payment and delivery for a won auction' })
  async checkoutWonAuction(
    @Param('id') id: string,
    @Body() dto: CheckoutDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const key = this.idempotencyService.requireKey(headers);
    const endpoint = `${request.method}:${request.path}:${id}`;
    const requestHash = this.idempotencyService.hashBody(dto);
    const replay = await this.idempotencyService.getReplayOrThrowConflict({
      key,
      actorType: ActorType.CUSTOMER,
      actorId: user.id,
      endpoint,
      requestHash,
    });
    if (replay) return replay;
    const response = await this.auctionsService.checkoutWonAuction(id, user.id, dto, request);
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

  @Post('auctions/:id/bids')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'auction-bid-20260713-0001' })
  @ApiOperation({ summary: 'Place an auction bid' })
  @ApiCreatedResponse({ schema: successEnvelopeSchema(PlaceBidResultDto) })
  @ApiBadRequestResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: { type: 'string', example: 'Bid is lower than minimum increment' },
        code: { type: 'string', example: 'BID_TOO_LOW' },
        requestId: { type: 'string', example: 'req_123' },
      },
    },
  })
  @ApiConflictResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: { type: 'string', example: 'Auction has ended' },
        code: { type: 'string', example: 'AUCTION_ENDED' },
        requestId: { type: 'string', example: 'req_123' },
      },
    },
  })
  async placeBid(
    @Param('id') id: string,
    @Body() dto: PlaceBidDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const key = this.idempotencyService.requireKey(headers);
    const endpoint = `${request.method}:${request.path}:${id}`;
    const requestHash = this.idempotencyService.hashBody(dto);
    const replay = await this.idempotencyService.getReplayOrThrowConflict({
      key,
      actorType: ActorType.CUSTOMER,
      actorId: user.id,
      endpoint,
      requestHash,
    });
    if (replay) {
      return replay;
    }
    const response = await this.auctionsService.placeBid(id, user.id, dto, request, key);
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

  private customerId(user?: AuthenticatedUser) {
    return user?.type === TokenType.Customer ? user.id : undefined;
  }
}
