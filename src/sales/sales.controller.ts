import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { QuickSaleDto } from 'src/sales/dto/quick-sale.dto';
import { SalesService } from 'src/sales/sales.service';

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('admin/sales')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('quick')
  @Permissions(PERMISSIONS.SALES_QUICK_CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'quick-sale-20260713-0001' })
  @ApiOperation({ summary: 'Create a quick manual or TikTok sale' })
  async quickSale(
    @Body() dto: QuickSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const key = this.idempotencyService.requireKey(headers);
    const endpoint = `${request.method}:${request.path}`;
    const requestHash = this.idempotencyService.hashBody(dto);
    const replay = await this.idempotencyService.getReplayOrThrowConflict({
      key,
      actorType: ActorType.ADMIN,
      actorId: user.id,
      endpoint,
      requestHash,
    });
    if (replay) {
      return replay;
    }

    const response = await this.salesService.quickSale(dto, user.id, request);
    await this.idempotencyService.store({
      key,
      actorType: ActorType.ADMIN,
      actorId: user.id,
      endpoint,
      requestHash,
      responseJson: response,
      statusCode: 201,
      expiresAt: this.idempotencyService.getExpiryDate(),
    });
    return response;
  }
}
