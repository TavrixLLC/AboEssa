import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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
import { RequestOtpDto } from 'src/customer-auth/dto/request-otp.dto';
import { VerifyOtpDto } from 'src/customer-auth/dto/verify-otp.dto';

@ApiTags('Customer auth')
@Controller('auth/customer')
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  @Post('request-otp')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request WhatsApp OTP for customer login' })
  requestOtp(@Body() dto: RequestOtpDto, @Req() request: Request) {
    return this.customerAuthService.requestOtp(dto, request);
  }

  @Post('verify-otp')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify OTP and login or claim virtual customer account' })
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() request: Request) {
    return this.customerAuthService.verifyOtp(dto, request);
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
}
