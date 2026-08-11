import { ActorType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ActorType })
  @IsOptional()
  @IsEnum(ActorType)
  actorType?: ActorType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @IsDateString()
  to?: string;
}

