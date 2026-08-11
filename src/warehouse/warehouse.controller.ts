import { Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { CustomerBoxQueryDto } from 'src/warehouse/dto/customer-box-query.dto';
import { ItemSearchQueryDto } from 'src/warehouse/dto/item-search-query.dto';
import { WarehouseLabelPendingQueryDto } from 'src/warehouse/dto/warehouse-label-pending-query.dto';
import { WarehouseService } from 'src/warehouse/warehouse.service';

@ApiTags('Warehouse')
@ApiBearerAuth()
@Controller('admin/warehouse')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
export class WarehouseController {
  constructor(
    private readonly warehouseService: WarehouseService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get('label-pending')
  @Permissions(PERMISSIONS.WAREHOUSE_READ)
  @ApiOperation({ summary: 'List sold items that still need labels' })
  labelPending(@Query() query: WarehouseLabelPendingQueryDto) {
    return this.warehouseService.labelPending(query);
  }

  @Post('items/:id/print-label')
  @Permissions(PERMISSIONS.WAREHOUSE_PRINT_LABEL)
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'print-label-20260713-0001' })
  @ApiOperation({ summary: 'Create or reuse a label print job for an item' })
  async printLabel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const key = this.idempotencyService.requireKey(headers);
    const endpoint = `${request.method}:${request.path}:${id}`;
    const requestHash = this.idempotencyService.hashBody({ id });
    const replay = await this.idempotencyService.getReplayOrThrowConflict({
      key,
      actorType: ActorType.ADMIN,
      actorId: user.id,
      endpoint,
      requestHash,
    });
    if (replay) {
      return replay;
    }

    const response = await this.warehouseService.printLabel(id, user.id);
    await this.idempotencyService.store({
      key,
      actorType: ActorType.ADMIN,
      actorId: user.id,
      endpoint,
      requestHash,
      responseJson: response,
      statusCode: 201,
      expiresAt: this.idempotencyService.getExpiryDate(),
    });
    return response;
  }

  @Post('items/:id/confirm-label-attached')
  @Permissions(PERMISSIONS.WAREHOUSE_CONFIRM_LABEL)
  @ApiOperation({ summary: 'Confirm a label was attached to an item' })
  confirmLabelAttached(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.warehouseService.confirmLabelAttached(id, user.id);
  }

  @Get('customer-boxes')
  @Permissions(PERMISSIONS.WAREHOUSE_READ)
  @ApiOperation({ summary: 'List customer warehouse boxes' })
  customerBoxes(@Query() query: CustomerBoxQueryDto) {
    return this.warehouseService.customerBoxes(query);
  }

  @Get('customer-boxes/:customerId')
  @Permissions(PERMISSIONS.WAREHOUSE_READ)
  @ApiOperation({ summary: 'Get a customer warehouse box and current items' })
  customerBoxDetails(@Param('customerId') customerId: string) {
    return this.warehouseService.customerBoxDetails(customerId);
  }

  @Get('items/search')
  @Permissions(PERMISSIONS.WAREHOUSE_SEARCH)
  @ApiOperation({ summary: 'Search warehouse item by barcode or text' })
  searchItems(@Query() query: ItemSearchQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.warehouseService.searchItems(query, user.id);
  }
}
