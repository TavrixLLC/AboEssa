import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const UPLOAD_IMAGE_FOLDERS = ['products', 'auctions', 'ads', 'customers', 'labels'] as const;

export type UploadImageFolder = (typeof UPLOAD_IMAGE_FOLDERS)[number];

export class UploadImageDto {
  @ApiPropertyOptional({ enum: UPLOAD_IMAGE_FOLDERS, example: 'products' })
  @IsOptional()
  @IsIn(UPLOAD_IMAGE_FOLDERS)
  folder?: UploadImageFolder;
}

export class UploadImageResultDto {
  @ApiProperty({ example: '/api/media/products/image-id.webp' })
  url: string;

  @ApiProperty({ example: 'products/image-id.webp' })
  key: string;

  @ApiProperty({ example: 'image/webp' })
  mimeType: string;

  @ApiProperty({ example: 12345 })
  size: number;
}
