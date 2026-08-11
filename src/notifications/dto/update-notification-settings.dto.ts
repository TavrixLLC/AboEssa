import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  auctionOutbid?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  auctionEndingSoon?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  auctionWon?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  orderUpdates?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ads?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  system?: boolean;
}
