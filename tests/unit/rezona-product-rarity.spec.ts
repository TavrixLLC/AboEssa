import { AuctionRarity } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AuctionQueryDto } from 'src/auctions/dto/auction-query.dto';
import {
  legacyAdminAuctionRarity,
  normalizeAuctionRarity,
} from 'src/auctions/auction-rarity.compat';
import { CreateAuctionDto } from 'src/auctions/dto/create-auction.dto';
import { MarketplaceQueryDto } from 'src/marketplace/dto/marketplace-query.dto';
import { CreateProductDto } from 'src/products/dto/create-product.dto';
import { ProductQueryDto } from 'src/products/dto/product-query.dto';
import { SalesController } from 'src/sales/sales.controller';

describe('REZONA auction rarity and retired quick sale', () => {
  const createAuction = (rarity?: string | null) =>
    plainToInstance(CreateAuctionDto, {
      title: 'Watch',
      categoryId: 'category-1',
      startingPrice: 150000,
      minIncrement: 1000,
      startsAt: '2026-09-13T10:00:00.000Z',
      endsAt: '2026-09-14T10:00:00.000Z',
      rarity,
    });

  it.each(Object.values(AuctionRarity))('accepts %s on auction creation and listing', (rarity) => {
    expect(validateSync(createAuction(rarity))).toHaveLength(0);
    expect(validateSync(plainToInstance(AuctionQueryDto, { rarity }))).toHaveLength(0);
    expect(validateSync(plainToInstance(MarketplaceQueryDto, { rarity }))).toHaveLength(0);
  });

  it('allows no rarity and maps legacy NORMAL to FEATURED', () => {
    expect(validateSync(createAuction())).toHaveLength(0);
    expect(validateSync(createAuction(null))).toHaveLength(0);
    expect(Object.values(AuctionRarity)).toContain('FEATURED');
    expect(Object.values(AuctionRarity)).not.toContain('NORMAL');
    expect(validateSync(createAuction('NORMAL'))).toHaveLength(0);
    expect(validateSync(plainToInstance(AuctionQueryDto, { rarity: 'NORMAL' }))).toHaveLength(0);
    expect(normalizeAuctionRarity('NORMAL')).toBe(AuctionRarity.FEATURED);
    expect(legacyAdminAuctionRarity(AuctionRarity.FEATURED)).toBe('NORMAL');
  });

  it('rejects an unknown auction rarity', () => {
    expect(validateSync(createAuction('VIP')).length).toBeGreaterThan(0);
    expect(
      validateSync(plainToInstance(AuctionQueryDto, { rarity: 'VIP' })).length,
    ).toBeGreaterThan(0);
    expect(
      validateSync(plainToInstance(MarketplaceQueryDto, { rarity: 'VIP' })).length,
    ).toBeGreaterThan(0);
  });

  it('does not accept rarity as a product field', () => {
    const product = plainToInstance(CreateProductDto, {
      title: 'Watch',
      categoryId: 'category-1',
      price: 150000,
      rarity: 'RARE',
    });
    const productQuery = plainToInstance(ProductQueryDto, { rarity: 'RARE' });
    expect(
      validateSync(product, { whitelist: true, forbidNonWhitelisted: true }).length,
    ).toBeGreaterThan(0);
    expect(
      validateSync(productQuery, { whitelist: true, forbidNonWhitelisted: true }).length,
    ).toBeGreaterThan(0);
  });

  it('has no quick-sale write handler', () => {
    expect(Object.getOwnPropertyNames(SalesController.prototype)).toEqual(['constructor']);
  });
});
