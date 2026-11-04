import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteCustomerAccountDto {
  @ApiProperty({ writeOnly: true, minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class PublicDeleteCustomerAccountDto extends DeleteCustomerAccountDto {
  @ApiProperty({ example: '+9647700000000' })
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  phone: string;
}
