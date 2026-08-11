import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { CustomerAddressesService } from 'src/customer-addresses/customer-addresses.service';
import { CreateCustomerAddressDto } from 'src/customer-addresses/dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from 'src/customer-addresses/dto/update-customer-address.dto';

@ApiTags('Customer addresses')
@ApiBearerAuth()
@Controller('customer/addresses')
@UseGuards(JwtAccessGuard)
@TokenTypes(TokenType.Customer)
export class CustomerAddressesController {
  constructor(private readonly addressesService: CustomerAddressesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerAddressDto) {
    return this.addressesService.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.addressesService.list(user.id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCustomerAddressDto) {
    return this.addressesService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.addressesService.remove(user.id, id);
  }

  @Post(':id/set-default')
  setDefault(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.addressesService.setDefault(user.id, id);
  }
}
