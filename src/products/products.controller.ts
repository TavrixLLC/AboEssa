import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import {
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
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';
import { successEnvelopeSchema } from 'src/common/swagger/response-envelope.schema';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { BuyProductDto } from 'src/products/dto/buy-product.dto';
import { CreateProductDto } from 'src/products/dto/create-product.dto';
import { ProductBuyResultDto, ProductListResponseDto, ProductResponseDto } from 'src/products/dto/product-response.dto';
import { ProductQueryDto } from 'src/products/dto/product-query.dto';
import { UpdateProductDto } from 'src/products/dto/update-product.dto';
import { ProductsService } from 'src/products/products.service';

@ApiTags('Products')
@ApiExtraModels(ProductResponseDto, ProductListResponseDto, ProductBuyResultDto)
@Controller()
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('admin/products')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  @ApiBearerAuth()
  @ApiCreatedResponse({ schema: successEnvelopeSchema(ProductResponseDto) })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.productsService.create(dto, user.id, request);
  }

  @Get('admin/products')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @ApiOkResponse({ schema: successEnvelopeSchema(ProductListResponseDto) })
  adminList(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get('admin/products/:id')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Admin)
  @ApiBearerAuth()
  @ApiOkResponse({ schema: successEnvelopeSchema(ProductResponseDto) })
  adminOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch('admin/products/:id')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  @ApiBearerAuth()
  @ApiOkResponse({ schema: successEnvelopeSchema(ProductResponseDto) })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.productsService.update(id, dto, user.id, request);
  }

  @Post('admin/products/:id/publish')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  @ApiBearerAuth()
  @ApiCreatedResponse({ schema: successEnvelopeSchema(ProductResponseDto) })
  publish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.productsService.publish(id, user.id, request);
  }

  @Post('admin/products/:id/cancel')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  @ApiBearerAuth()
  @ApiCreatedResponse({ schema: successEnvelopeSchema(ProductResponseDto) })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.productsService.cancel(id, user.id, request);
  }

  @Get('products')
  @Public()
  @ApiOperation({ summary: 'List active products' })
  @ApiOkResponse({ schema: successEnvelopeSchema(ProductListResponseDto) })
  list(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query, true);
  }

  @Get('products/:id')
  @Public()
  @ApiOperation({ summary: 'Get active product details' })
  @ApiOkResponse({ schema: successEnvelopeSchema(ProductResponseDto) })
  one(@Param('id') id: string) {
    return this.productsService.findOne(id, true);
  }

  @Post('products/:id/buy')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'product-buy-20260713-0001' })
  @ApiOperation({ summary: 'Atomically buy a fixed-price product' })
  @ApiCreatedResponse({ schema: successEnvelopeSchema(ProductBuyResultDto) })
  @ApiConflictResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: { type: 'string', example: 'Product already sold' },
        code: { type: 'string', example: 'PRODUCT_ALREADY_SOLD' },
        requestId: { type: 'string', example: 'req_123' },
      },
    },
  })
  async buy(
    @Param('id') id: string,
    @Body() dto: BuyProductDto = {},
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const key = this.idempotencyService.requireKey(headers);
    const endpoint = `${request.method}:${request.path}:${id}`;
    const requestHash = this.idempotencyService.hashBody({ id, quantity: dto.quantity ?? 1 });
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
    const response = await this.productsService.buy(id, user.id, request, dto);
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
}
