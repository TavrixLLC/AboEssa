import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { successEnvelopeSchema, unitSuccessEnvelopeSchema } from 'src/common/swagger/response-envelope.schema';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { CustomerDevicesService } from 'src/notifications/customer-devices.service';
import { CustomerDeviceResponseDto, RegisterCustomerDeviceDto } from 'src/notifications/dto/customer-device.dto';

@ApiTags('Customer devices')
@ApiBearerAuth()
@ApiExtraModels(CustomerDeviceResponseDto)
@Controller('customer/devices')
@UseGuards(JwtAccessGuard)
@TokenTypes(TokenType.Customer)
export class CustomerDevicesController {
  constructor(private readonly service: CustomerDevicesService) {}

  @Post()
  @ApiOperation({ summary: 'Register or rotate the authenticated customer installation push token' })
  @ApiOkResponse({ schema: successEnvelopeSchema(CustomerDeviceResponseDto) })
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterCustomerDeviceDto) {
    return this.service.register(user.id, dto);
  }

  @Delete(':installationId')
  @ApiOperation({ summary: 'Unregister only this authenticated customer installation' })
  @ApiOkResponse({ schema: unitSuccessEnvelopeSchema() })
  unregister(@CurrentUser() user: AuthenticatedUser, @Param('installationId') installationId: string) {
    return this.service.unregister(user.id, installationId);
  }
}
