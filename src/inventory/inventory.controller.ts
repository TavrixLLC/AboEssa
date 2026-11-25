import {
  Body,
  CanActivate,
  Controller,
  Get,
  Headers,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { PERMISSIONS as P } from 'src/common/constants/permissions.constants';
import {
  AdjustStockDto,
  InventoryBackfillDto,
  InventoryQueryDto,
  LocationWriteDto,
  StockInDto,
  TransferStockDto,
  WarehouseWriteDto,
} from './inventory.dto';
import { InventoryService } from './inventory.service';

@Injectable()
export class InventoryEnabledGuard implements CanActivate {
  constructor(private readonly inventory: InventoryService) {}
  canActivate() {
    this.inventory.assertEnabled();
    return true;
  }
}
@ApiTags('Warehouse inventory')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAccessGuard, PermissionsGuard, InventoryEnabledGuard)
@TokenTypes(TokenType.Admin)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Get('warehouses')
  @Permissions(P.INVENTORY_READ)
  warehouses(@Query() q: InventoryQueryDto) {
    return this.inventory.warehouses(q);
  }
  @Get('warehouses/:id')
  @Permissions(P.INVENTORY_READ)
  warehouse(@Param('id') id: string) {
    return this.inventory.warehouse(id);
  }
  @Post('warehouses')
  @Permissions(P.WAREHOUSE_MANAGE)
  createWarehouse(@Body() dto: WarehouseWriteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.inventory.writeWarehouse(undefined, dto, actor.id);
  }
  @Patch('warehouses/:id')
  @Permissions(P.WAREHOUSE_MANAGE)
  updateWarehouse(
    @Param('id') id: string,
    @Body() dto: WarehouseWriteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventory.writeWarehouse(id, dto, actor.id);
  }
  @Get('warehouse-locations')
  @Permissions(P.INVENTORY_READ)
  locations(@Query() q: InventoryQueryDto) {
    return this.inventory.locations(q);
  }
  @Get('warehouse-locations/:id')
  @Permissions(P.INVENTORY_READ)
  location(@Param('id') id: string) {
    return this.inventory.location(id);
  }
  @Post('warehouse-locations')
  @Permissions(P.WAREHOUSE_MANAGE)
  createLocation(@Body() dto: LocationWriteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.inventory.writeLocation(undefined, dto, actor.id);
  }
  @Patch('warehouse-locations/:id')
  @Permissions(P.WAREHOUSE_MANAGE)
  updateLocation(
    @Param('id') id: string,
    @Body() dto: LocationWriteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventory.writeLocation(id, dto, actor.id);
  }
  @Get('inventory/products')
  @Permissions(P.INVENTORY_READ)
  products(@Query() q: InventoryQueryDto) {
    return this.inventory.products(q);
  }
  @Get('inventory/reconciliation')
  @Permissions(P.INVENTORY_RECONCILE)
  reconciliation(@Query() q: InventoryQueryDto) {
    return this.inventory.reconciliation(q);
  }
  @Post('inventory/backfill')
  @Permissions(P.INVENTORY_MIGRATE)
  backfill(@Body() dto: InventoryBackfillDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.inventory.backfill(dto, actor.id);
  }
  @Get('products/:id/inventory')
  @Permissions(P.INVENTORY_READ)
  product(@Param('id') id: string) {
    return this.inventory.productInventory(id);
  }
  @Get('products/:id/inventory/movements')
  @Permissions(P.INVENTORY_READ)
  movements(@Param('id') id: string, @Query() q: InventoryQueryDto) {
    return this.inventory.movements(id, q);
  }
  @Post('products/:id/inventory/stock-in')
  @Permissions(P.INVENTORY_RECEIVE)
  stockIn(
    @Param('id') id: string,
    @Body() dto: StockInDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.inventory.stockIn(id, dto, actor.id, key ?? '');
  }
  @Post('products/:id/inventory/adjust')
  @Permissions(P.INVENTORY_ADJUST)
  adjust(
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.inventory.adjust(id, dto, actor.id, key ?? '');
  }
  @Post('inventory/transfers')
  @Permissions(P.INVENTORY_TRANSFER)
  transfer(
    @Body() dto: TransferStockDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.inventory.transfer(dto, actor.id, key ?? '');
  }
}
