import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { WalletService } from 'src/wallet/wallet.service';

@ApiTags('Customer wallet')
@ApiBearerAuth()
@Controller('customer/wallet')
@UseGuards(JwtAccessGuard)
@TokenTypes(TokenType.Customer)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get my wallet balances and recent transactions (no funding endpoint)' })
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getForCustomer(user.id);
  }
}
