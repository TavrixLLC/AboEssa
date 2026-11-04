import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AppException } from 'src/common/exceptions/app.exception';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { AdminConsoleService } from './admin-console.service';
import { ConsoleOrderActionDto, ConsoleOrdersQueryDto } from './console.dto';

@ApiTags('Admin essentials')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
export class AdminConsoleController {
  constructor(private readonly console: AdminConsoleService) {}
  @Get('console/overview')
  @Permissions(PERMISSIONS.DASHBOARD_VIEW)
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.console.overview(user);
  }
  @Get('orders')
  @Permissions(PERMISSIONS.SHIPPING_MANAGE)
  orders(@Query() query: ConsoleOrdersQueryDto) {
    return this.console.orders(query);
  }
  @Get('orders/:id')
  @Permissions(PERMISSIONS.SHIPPING_MANAGE)
  order(@Param('id') id: string) {
    return this.console.order(id);
  }
  @Post('orders/:id/actions')
  @Permissions(PERMISSIONS.SHIPPING_MANAGE)
  change(
    @Param('id') id: string,
    @Body() dto: ConsoleOrderActionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const sensitivePermission =
      dto.action === 'CANCEL'
        ? PERMISSIONS.SALES_CANCEL
        : ['SHIP', 'DELIVER'].includes(dto.action)
          ? PERMISSIONS.SHIPPING_SHIP
          : null;
    if (
      sensitivePermission &&
      !(user.isOwner || user.role === 'OWNER' || user.permissions?.includes(sensitivePermission))
    )
      throw new AppException(
        'You do not have permission to perform this action',
        'INSUFFICIENT_PERMISSIONS',
        403,
      );
    return this.console.changeOrder(id, dto, user.id, request);
  }
  @Get('console/customers/:id')
  @Permissions(PERMISSIONS.CUSTOMERS_READ)
  customer(@Param('id') id: string) {
    return this.console.customer(id);
  }
}
