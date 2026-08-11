import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MarketplaceQueryDto } from 'src/marketplace/dto/marketplace-query.dto';
import { MarketplaceItemDto, MarketplaceListResponseDto } from 'src/marketplace/dto/marketplace-response.dto';
import { MarketplaceService } from 'src/marketplace/marketplace.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { OptionalJwtAccessGuard } from 'src/common/guards/optional-jwt-access.guard';
import { successEnvelopeSchema } from 'src/common/swagger/response-envelope.schema';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';

@ApiTags('Marketplace')
@ApiExtraModels(MarketplaceItemDto, MarketplaceListResponseDto)
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get()
  @UseGuards(OptionalJwtAccessGuard)
  @ApiOperation({ summary: 'List unified marketplace products and auctions' })
  @ApiOkResponse({ schema: successEnvelopeSchema(MarketplaceListResponseDto) })
  list(@Query() query: MarketplaceQueryDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.marketplaceService.findAll(query, user?.type === TokenType.Customer ? user.id : undefined);
  }
}
