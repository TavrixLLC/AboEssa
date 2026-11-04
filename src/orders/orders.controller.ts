import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CheckoutDeliveryDto } from 'src/checkout/dto/checkout.dto';
import { OrderActionsService } from 'src/orders/order-actions.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { CustomerOrderItemsQueryDto } from 'src/order-items/dto/customer-order-items-query.dto';
import { OrdersService } from 'src/orders/orders.service';

@ApiTags('Customer box and orders')
@ApiBearerAuth()
@Controller('customer')
@UseGuards(JwtAccessGuard)
@TokenTypes(TokenType.Customer)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly actions: OrderActionsService,
  ) {}

  @Post('orders/:id/pay-wallet')
  @ApiOperation({ summary: 'Pay the outstanding amount of a confirmed order from my wallet' })
  payWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.actions.payWithWallet(user.id, id, request);
  }

  @Patch('orders/:id/delivery')
  @ApiOperation({ summary: 'Complete delivery details without confirming an order again' })
  updateDelivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CheckoutDeliveryDto,
    @Req() request: Request,
  ) {
    return this.actions.updateDelivery(user.id, id, dto, request);
  }

  @Get('box')
  @ApiOperation({ summary: 'Get authenticated customer warehouse box' })
  box(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.customerBox(user.id);
  }

  @Get('order-items')
  @ApiOperation({ summary: 'List authenticated customer order items' })
  orderItems(@CurrentUser() user: AuthenticatedUser, @Query() query: CustomerOrderItemsQueryDto) {
    return this.ordersService.customerOrderItems(user.id, query);
  }

  @Get('orders')
  @ApiOperation({ summary: 'List authenticated customer orders' })
  orders(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.customerOrders(user.id);
  }
}
