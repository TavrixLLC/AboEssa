import {
  NotificationAudienceType,
  NotificationCampaignStatus,
  NotificationLinkType,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

const normalize = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class AdminNotificationAudienceDto {
  @ApiProperty({ enum: NotificationAudienceType })
  @IsEnum(NotificationAudienceType)
  audienceType: NotificationAudienceType;

  @ApiPropertyOptional({ description: 'Required only for ONE_CUSTOMER' })
  @ValidateIf(
    (dto: AdminNotificationAudienceDto) =>
      dto.audienceType === NotificationAudienceType.ONE_CUSTOMER,
  )
  @IsString()
  @MinLength(1)
  customerId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Required only for SELECTED_CUSTOMERS; maximum 200 customers',
  })
  @ValidateIf(
    (dto: AdminNotificationAudienceDto) =>
      dto.audienceType === NotificationAudienceType.SELECTED_CUSTOMERS,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  customerIds?: string[];
}

export class AudiencePreviewDto extends AdminNotificationAudienceDto {}

export class SendAdminNotificationDto extends AdminNotificationAudienceDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(normalize)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  titleAr: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(normalize)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  titleEn?: string;

  @ApiProperty({ maxLength: 500 })
  @Transform(normalize)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  bodyAr: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(normalize)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  bodyEn?: string;

  @ApiPropertyOptional({ enum: NotificationLinkType, default: NotificationLinkType.NONE })
  @IsOptional()
  @IsEnum(NotificationLinkType)
  linkType?: NotificationLinkType = NotificationLinkType.NONE;

  @ApiPropertyOptional({ description: 'Required for Product, Auction, or Category links' })
  @ValidateIf(
    (dto: SendAdminNotificationDto) =>
      (dto.linkType ?? NotificationLinkType.NONE) !== NotificationLinkType.NONE,
  )
  @IsString()
  @MinLength(1)
  linkTargetId?: string;
}

export class AdminNotificationHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: NotificationAudienceType })
  @IsOptional()
  @IsEnum(NotificationAudienceType)
  audienceType?: NotificationAudienceType;

  @ApiPropertyOptional({ enum: NotificationCampaignStatus })
  @IsOptional()
  @IsEnum(NotificationCampaignStatus)
  status?: NotificationCampaignStatus;

  @ApiPropertyOptional({ description: 'Search localized campaign title or body' })
  @IsOptional()
  @Transform(normalize)
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class AdminNotificationCustomerSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;
}

export class AudiencePreviewResponseDto {
  @ApiProperty()
  recipientCount: number;

  @ApiProperty({ type: [AdminNotificationCustomerSummaryDto] })
  selectedCustomers: AdminNotificationCustomerSummaryDto[];
}

export class AdminNotificationSendResponseDto {
  @ApiProperty()
  campaignId: string;

  @ApiProperty()
  recipientCount: number;

  @ApiProperty()
  createdCount: number;

  @ApiProperty()
  failedCount: number;

  @ApiProperty({ enum: NotificationCampaignStatus })
  status: NotificationCampaignStatus;
}

export class AdminNotificationSenderDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class AdminNotificationCampaignResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  titleAr: string;

  @ApiPropertyOptional({ nullable: true })
  titleEn: string | null;

  @ApiProperty()
  bodyAr: string;

  @ApiPropertyOptional({ nullable: true })
  bodyEn: string | null;

  @ApiProperty({ enum: NotificationAudienceType })
  audienceType: NotificationAudienceType;

  @ApiPropertyOptional({ nullable: true })
  audienceMetadata: unknown;

  @ApiProperty({ enum: NotificationLinkType })
  linkType: NotificationLinkType;

  @ApiPropertyOptional({ nullable: true })
  linkTargetId: string | null;

  @ApiProperty()
  recipientCount: number;

  @ApiProperty()
  createdCount: number;

  @ApiProperty()
  failureCount: number;

  @ApiProperty({ enum: NotificationCampaignStatus })
  status: NotificationCampaignStatus;

  @ApiProperty({ type: AdminNotificationSenderDto })
  sender: AdminNotificationSenderDto;

  @ApiProperty()
  createdAt: Date;
}

export class AdminNotificationCampaignListResponseDto {
  @ApiProperty({ type: [AdminNotificationCampaignResponseDto] })
  items: AdminNotificationCampaignResponseDto[];

  @ApiProperty()
  meta: { page: number; limit: number; total: number; totalPages: number };
}
