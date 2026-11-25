import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { PERMISSIONS as P } from 'src/common/constants/permissions.constants';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { RecognitionService } from 'src/ai/recognition.service';
import { IntakeEnabledGuard } from './product-intake.controller';
class AnalyzeDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) clientImageId: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) requestKey: string;
  @IsOptional() @IsBoolean() reanalyze?: boolean;
}
class ApproveDto {
  @IsString() @Length(1, 80) requestId: string;
  @IsInt() @Min(0) expectedRevision: number;
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) clientImageId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(['title', 'description', 'categoryId'], { each: true })
  fields: string[];
  @IsOptional() @IsBoolean() replace?: boolean;
}
class CancelDto {
  @IsString() @Length(1, 80) requestId: string;
}
class DecisionDto {
  @IsInt() @Min(0) expectedRevision: number;
  @IsString() @Matches(/^[a-f0-9]{64}$/) candidatesHash: string;
  @IsString() @Length(5, 300) reason: string;
}
@Controller('admin/product-intake')
@UseGuards(JwtAccessGuard, PermissionsGuard, IntakeEnabledGuard)
@TokenTypes(TokenType.Admin)
@Permissions(P.INTAKE_USE)
export class IntakeRecognitionController {
  constructor(private readonly recognition: RecognitionService) {}
  @Post('sessions/:id/recognition') analyze(
    @Param('id') id: string,
    @Body() dto: AnalyzeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.recognition.analyze(id, dto, actor);
  }
  @Get('sessions/:id/recognition') status(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.recognition.status(id, actor);
  }
  @Post('sessions/:id/recognition/approve') approve(
    @Param('id') id: string,
    @Body() dto: ApproveDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.recognition.approve(id, dto, actor);
  }
  @Post('sessions/:id/recognition/cancel') cancel(
    @Param('id') id: string,
    @Body() dto: CancelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.recognition.cancel(id, dto.requestId, actor);
  }
  @Get('sessions/:id/duplicates') duplicates(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.recognition.duplicateReview(id, actor);
  }
  @Post('sessions/:id/duplicates/distinct') decide(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.recognition.decide(id, dto, actor);
  }
  @Get('recognition-usage') usage(@CurrentUser() actor: AuthenticatedUser) {
    return this.recognition.usage(actor);
  }
}
