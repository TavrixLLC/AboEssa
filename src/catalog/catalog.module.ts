import { Controller, Get, Header, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogQueryDto, CatalogMediaQueryDto } from './catalog-query.dto';
import { CatalogMediaService } from './catalog-media.service';
import { CatalogService } from './catalog.service';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CatalogMediaInterceptor } from './catalog-media.interceptor';
import { SocketsModule } from 'src/sockets/sockets.module';

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly media: CatalogMediaService,
  ) {}

  @Get('media')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Batched published media lookup for saved catalog references' })
  mediaLookup(@Query() query: CatalogMediaQueryDto) {
    return this.media.lookup(query.keys);
  }
  @Get('products')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Lightweight product cards; keyset pagination' })
  products(@Query() query: CatalogQueryDto) {
    return this.catalog.list('products', query);
  }
  @Get('auctions')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Public auction cards; user bid state remains in detail API' })
  auctions(@Query() query: CatalogQueryDto) {
    return this.catalog.list('auctions', query);
  }
  @Get('marketplace')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Interleaved product and auction cards without discarded page items' })
  marketplace(@Query() query: CatalogQueryDto) {
    return this.catalog.list('marketplace', query);
  }
}

@Module({
  imports: [SocketsModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    CatalogMediaService,
    { provide: APP_INTERCEPTOR, useClass: CatalogMediaInterceptor },
  ],
})
export class CatalogModule {}
