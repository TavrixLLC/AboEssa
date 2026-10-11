import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthRefreshDto } from 'src/admin-auth/dto/auth-refresh.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { CustomerAuthService } from 'src/customer-auth/customer-auth.service';
import { CustomerLoginDto } from 'src/customer-auth/dto/customer-login.dto';
import { CustomerRegisterDto } from 'src/customer-auth/dto/customer-register.dto';
import {
  DeleteCustomerAccountDto,
  PublicDeleteCustomerAccountDto,
} from 'src/customer-auth/dto/delete-customer-account.dto';

@ApiTags('Customer auth')
@Controller('auth/customer')
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a customer account with phone and password' })
  register(@Body() dto: CustomerRegisterDto, @Req() request: Request) {
    return this.customerAuthService.register(dto, request);
  }

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Customer login with phone and password' })
  login(@Body() dto: CustomerLoginDto, @Req() request: Request) {
    return this.customerAuthService.login(dto, request);
  }

  @Post('refresh')
  @Public()
  refresh(@Body() dto: AuthRefreshDto, @Req() request: Request) {
    return this.customerAuthService.refresh(dto.refreshToken, request);
  }

  @Post('logout')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  @ApiBearerAuth()
  logout(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.customerAuthService.logout(user.id, request);
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.customerAuthService.me(user.id);
  }

  @Post('delete-account')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAccessGuard)
  @TokenTypes(TokenType.Customer)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Permanently delete the authenticated customer account' })
  deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteCustomerAccountDto,
    @Req() request: Request,
  ) {
    return this.customerAuthService.deleteAccount(user.id, dto.password, request);
  }

  @Post('delete-account-request')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Delete a customer account from the public web resource' })
  deleteAccountFromWeb(@Body() dto: PublicDeleteCustomerAccountDto, @Req() request: Request) {
    return this.customerAuthService.deleteAccountFromWeb(dto.phone, dto.password, request);
  }
}
