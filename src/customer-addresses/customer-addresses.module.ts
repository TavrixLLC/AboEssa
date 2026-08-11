import { Module } from '@nestjs/common';
import { CustomerAddressesController } from 'src/customer-addresses/customer-addresses.controller';
import { CustomerAddressesService } from 'src/customer-addresses/customer-addresses.service';

@Module({
  controllers: [CustomerAddressesController],
  providers: [CustomerAddressesService],
})
export class CustomerAddressesModule {}

