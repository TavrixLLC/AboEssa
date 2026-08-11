import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductListingStatus, SaleSource, LabelStatus } from '@prisma/client';

export class ProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty()
  categoryId: string;

  @ApiPropertyOptional({ nullable: true })
  categoryName: string | null;

  @ApiProperty({ type: [String] })
  imageUrls: string[];

  @ApiPropertyOptional({ nullable: true })
  primaryImageUrl?: string | null;

  @ApiProperty({ example: '15000' })
  price: string;

  @ApiProperty({ minimum: 1 })
  totalQuantity: number;

  @ApiProperty({ minimum: 0 })
  availableQuantity: number;

  @ApiProperty({ minimum: 0 })
  soldQuantity: number;

  @ApiProperty({ enum: ProductListingStatus })
  status: ProductListingStatus;

  @ApiProperty()
  isAvailable: boolean;

  @ApiProperty()
  isOutOfStock: boolean;

  @ApiPropertyOptional({ nullable: true })
  soldAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional({ enum: SaleSource, nullable: true })
  saleSource?: SaleSource | null;

  @ApiPropertyOptional({ nullable: true })
  buyerCustomerId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  buyerCustomer?: unknown;

  @ApiPropertyOptional({ nullable: true })
  orderItemId?: string | null;

  @ApiPropertyOptional({ enum: LabelStatus, nullable: true })
  labelStatus?: LabelStatus | null;
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  items: ProductResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class ProductBuyResultDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  orderItemId: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty({ enum: LabelStatus })
  labelStatus: LabelStatus;

  @ApiProperty()
  customerId: string;

  @ApiProperty({ example: '15000' })
  price: string;

  @ApiProperty({ minimum: 1 })
  requestedQuantity: number;

  @ApiProperty({ minimum: 1 })
  purchasedQuantity: number;

  @ApiProperty({ minimum: 0 })
  remainingQuantity: number;

  @ApiProperty({ example: '15000' })
  unitPrice: string;

  @ApiProperty({ example: '30000' })
  totalPrice: string;

  @ApiProperty()
  orderItems: unknown[];

  @ApiProperty()
  purchasedAt: Date;

  @ApiProperty({ example: 'PURCHASED' })
  status: string;

  @ApiProperty({ example: 'Product purchased successfully' })
  message: string;

  @ApiProperty({ type: ProductResponseDto })
  product: ProductResponseDto;

  @ApiProperty()
  sale: unknown;
}
