import { PartialType } from '@nestjs/swagger';
import { CreateCustomerAddressDto } from 'src/customer-addresses/dto/create-customer-address.dto';

export class UpdateCustomerAddressDto extends PartialType(CreateCustomerAddressDto) {}
