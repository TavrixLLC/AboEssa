import { Prisma, ProductListingStatus, ProductRarity } from '@prisma/client';
import { ProductsService } from 'src/products/products.service';

describe('Product discounts', () => {
  const service = new ProductsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const product = {
    id: 'product-1',
    title: 'Discounted product',
    description: null,
    categoryId: 'category-1',
    imageUrls: [],
    price: new Prisma.Decimal('100000'),
    discountPercentage: 20,
    totalQuantity: 5,
    availableQuantity: 5,
    soldQuantity: 0,
    status: ProductListingStatus.ACTIVE,
    rarity: ProductRarity.NORMAL,
    soldToCustomerId: null,
    soldOrderItemId: null,
    publishedAt: new Date(),
    soldAt: null,
    createdByAdminId: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: 'category-1', name: 'Category' },
    soldToCustomer: null,
    soldOrderItem: null,
  };

  it('returns the effective discounted price to customers', () => {
    const response = service.toProductResponse(product as never, false);

    expect(response.price).toBe('80000.00');
    expect(response.originalPrice).toBe('100000.00');
    expect(response.discountedPrice).toBe('80000.00');
    expect(response.discountPercentage).toBe(20);
    expect(response.hasDiscount).toBe(true);
  });

  it('keeps the base price visible to admins', () => {
    const response = service.toProductResponse(product as never, true);

    expect(response.price).toBe('100000.00');
    expect(response.discountedPrice).toBe('80000.00');
  });
});
