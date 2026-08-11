import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional({ nullable: true })
  titleAr?: string | null;

  @ApiPropertyOptional({ nullable: true })
  titleEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  bodyAr?: string | null;

  @ApiPropertyOptional({ nullable: true })
  bodyEn?: string | null;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true })
  linkType?: string | null;

  @ApiPropertyOptional({ nullable: true })
  linkTargetId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata?: unknown;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items: NotificationResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  @ApiPropertyOptional()
  unreadCount?: number;
}

export class NotificationUnreadCountResponseDto {
  @ApiProperty()
  count: number;
}

export class NotificationBatchReadResponseDto {
  @ApiProperty()
  updatedCount: number;
}

export class NotificationSettingsResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  customerId: string;

  @ApiProperty()
  auctionOutbid: boolean;

  @ApiProperty()
  auctionEndingSoon: boolean;

  @ApiProperty()
  auctionWon: boolean;

  @ApiProperty()
  orderUpdates: boolean;

  @ApiProperty()
  ads: boolean;

  @ApiProperty()
  system: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
