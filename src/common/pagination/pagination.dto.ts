import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const getPagination = (query: PaginationQueryDto) => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
};

export const toPaginatedResult = <T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> => ({
  items,
  meta: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  },
});

