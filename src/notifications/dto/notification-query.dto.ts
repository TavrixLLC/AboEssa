import { NotificationType } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

const notificationSortFields = ['createdAt'] as const;
const sortOrders = ['asc', 'desc'] as const;

export class NotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ enum: notificationSortFields, default: 'createdAt' })
  @IsOptional()
  @IsIn(notificationSortFields)
  sortBy?: (typeof notificationSortFields)[number];

  @ApiPropertyOptional({ enum: sortOrders, default: 'desc' })
  @IsOptional()
  @IsIn(sortOrders)
  sortOrder?: (typeof sortOrders)[number];
}
