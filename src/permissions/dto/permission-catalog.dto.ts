import { ApiProperty } from '@nestjs/swagger';

export class PermissionCatalogItemDto {
  @ApiProperty({ example: 'products.view' })
  key: string;

  @ApiProperty({ example: 'مشاهدة المنتجات' })
  labelAr: string;

  @ApiProperty({ example: 'View products' })
  labelEn: string;

  @ApiProperty({ example: 'يسمح للموظف بمشاهدة المنتجات' })
  descriptionAr: string;

  @ApiProperty({ example: 'Allows viewing products' })
  descriptionEn: string;

  @ApiProperty({ example: false })
  dangerous: boolean;

  @ApiProperty({ example: 'products' })
  module: string;

  @ApiProperty({ example: 'view' })
  action: string;

  @ApiProperty({ example: 'permissions.products.view' })
  labelKey: string;

  @ApiProperty({ enum: ['NORMAL', 'SENSITIVE', 'DANGEROUS', 'OWNER_ONLY'], example: 'NORMAL' })
  riskLevel: 'NORMAL' | 'SENSITIVE' | 'DANGEROUS' | 'OWNER_ONLY';

  @ApiProperty({ example: true })
  ownerOnly: boolean;

  @ApiProperty({ example: true })
  assignable: boolean;

  @ApiProperty({ example: 10 })
  sortOrder: number;
}

export class PermissionCatalogGroupDto {
  @ApiProperty({ example: 'products' })
  group: string;

  @ApiProperty({ example: 'المنتجات' })
  labelAr: string;

  @ApiProperty({ example: 'Products' })
  labelEn: string;

  @ApiProperty({ type: [PermissionCatalogItemDto] })
  permissions: PermissionCatalogItemDto[];
}
