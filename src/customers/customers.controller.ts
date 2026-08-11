import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { CreateVirtualCustomerDto } from 'src/customers/dto/create-virtual-customer.dto';
import { CustomerQueryDto } from 'src/customers/dto/customer-query.dto';
import { ReviewCustomerDto } from 'src/customers/dto/review-customer.dto';
import { UpdateCustomerDto } from 'src/customers/dto/update-customer.dto';
import { CustomersService } from 'src/customers/customers.service';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('admin/customers')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('virtual')
  @Permissions(PERMISSIONS.CUSTOMERS_CREATE)
  createVirtual(
    @Body() dto: CreateVirtualCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.customersService.createVirtual(dto, user.id, request);
  }

  @Get()
  @Permissions(PERMISSIONS.CUSTOMERS_READ)
  findAll(@Query() query: CustomerQueryDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CUSTOMERS_READ)
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.customersService.update(id, dto, user.id, request);
  }

  @Post(':id/verify')
  @Permissions(PERMISSIONS.CUSTOMERS_VERIFY)
  verify(
    @Param('id') id: string,
    @Body() dto: ReviewCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.customersService.verify(id, dto, user.id, request);
  }

  @Post(':id/reject')
  @Permissions(PERMISSIONS.CUSTOMERS_VERIFY)
  reject(
    @Param('id') id: string,
    @Body() dto: ReviewCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.customersService.reject(id, dto, user.id, request);
  }

  @Post(':id/block')
  @Permissions(PERMISSIONS.CUSTOMERS_BLOCK)
  block(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.customersService.block(id, user.id, request);
  }

  @Post(':id/unblock')
  @Permissions(PERMISSIONS.CUSTOMERS_BLOCK)
  unblock(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.customersService.unblock(id, user.id, request);
  }
}

