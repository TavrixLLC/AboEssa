import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { PERMISSIONS as P } from 'src/common/constants/permissions.constants';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { ImageEnhancementService } from 'src/image-enhancement/enhancement.service';
import { ENHANCEMENT_MODES, EnhancementMode } from 'src/image-enhancement/enhancement.config';
import { IntakeEnabledGuard } from './product-intake.controller';
import {
  STUDIO_GROUPS,
  STUDIO_MODES,
  STUDIO_SOURCE_KINDS,
  type StudioGroup,
  type StudioMode,
  type StudioSourceKind,
} from 'src/image-enhancement/studio-templates';
class StudioSelectionDto {
  @IsString() @Matches(/^REZONA_[A-Z0-9_]+$/) @Length(1, 100) templateId: string;
  @IsInt() @IsIn([1]) templateVersion: number;
  @IsIn(STUDIO_MODES) processingMode: StudioMode;
  @IsIn(STUDIO_SOURCE_KINDS) sourceKind: StudioSourceKind;
  @IsOptional() @IsBoolean() evidenceReviewed?: boolean;
}
class StudioCatalogDto {
  @IsOptional() @IsIn(STUDIO_GROUPS) group?: StudioGroup;
}
class LocalReviewPreviewDto {
  @IsString() @Matches(/^REZONA_[A-Z0-9_]+$/) @Length(1, 100) templateId: string;
  @IsInt() @IsIn([1]) templateVersion: number;
}
class RegionDto {
  @IsNumber() @Min(0) @Max(0.95) x: number;
  @IsNumber() @Min(0) @Max(0.95) y: number;
  @IsNumber() @Min(0.05) @Max(1) width: number;
  @IsNumber() @Min(0.05) @Max(1) height: number;
}
class PlacementDto {
  @IsIn(['TOP_DOWN', 'UPRIGHT']) camera: 'TOP_DOWN' | 'UPRIGHT';
  @IsInt() @IsIn([0, 1, 2, 3]) quarterTurns: 0 | 1 | 2 | 3;
  @IsNumber() @Min(0.4) @Max(0.6) horizontal: number;
}
class StartDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) clientImageId: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) requestKey: string;
  @IsIn(ENHANCEMENT_MODES) mode: EnhancementMode;
  @IsOptional() @IsIn(['WHITE', 'LIGHT_GRAY']) background?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2) generation?: number;
  @IsOptional() @ValidateNested() @Type(() => RegionDto) foregroundRegion?: RegionDto;
  @IsOptional() @IsString() @Length(1, 80) sourceCandidateId?: string;
  @IsOptional() @IsBoolean() maskReviewed?: boolean;
  @IsOptional() @IsBoolean() privateTransferApproved?: boolean;
  @IsOptional() @IsString() @Length(1, 80) stylePreset?: string;
  @IsOptional() @ValidateNested() @Type(() => PlacementDto) placement?: PlacementDto;
  @IsOptional() @IsBoolean() placementReviewed?: boolean;
  @IsOptional() @IsBoolean() generativeProductApproved?: boolean;
  @IsOptional() @IsIn(['APPROVED_MASK', 'ORIGINAL_REFERENCE']) referenceKind?:
    'APPROVED_MASK' | 'ORIGINAL_REFERENCE';
  @IsOptional() @IsBoolean() originalReferenceReviewed?: boolean;
  @IsOptional() @IsBoolean() sourceWarningsReviewed?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => StudioSelectionDto)
  studioSelection?: StudioSelectionDto;
}
class DecideDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) clientImageId: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) requestKey: string;
  @IsInt() @Min(0) expectedRevision: number;
  @IsInt() @Min(0) expectedMediaRevision: number;
  @IsIn(['ACCEPT', 'REJECT', 'ORIGINAL']) action: string;
  @IsOptional() @IsString() @Length(1, 80) candidateId?: string;
  @IsBoolean() reviewed: boolean;
  @IsOptional() @IsBoolean() sceneReviewed?: boolean;
  @IsOptional() @IsBoolean() meaningfulImprovement?: boolean;
  @IsOptional() @IsBoolean() identityReviewed?: boolean;
  @IsOptional() @IsBoolean() premiumSceneReviewed?: boolean;
  @IsOptional() @IsBoolean() generativeNatureAcknowledged?: boolean;
  @IsOptional() @IsBoolean() materialMismatchObserved?: boolean;
  @IsOptional() @IsInt() @Min(0) expectedDecisionRevision?: number;
}
class PreviewDto {
  @IsOptional() @IsIn(['480', '1024']) edge?: string;
  @IsOptional() @IsIn(['candidate', 'mask']) kind?: string;
}
@Controller('admin/product-intake/sessions/:id/enhancements')
@UseGuards(JwtAccessGuard, PermissionsGuard, IntakeEnabledGuard)
@TokenTypes(TokenType.Admin)
@Permissions(P.INTAKE_USE, P.PRODUCTS_UPLOAD_IMAGES)
export class IntakeEnhancementController {
  constructor(private readonly enhancement: ImageEnhancementService) {}
  @Post() start(
    @Param('id') id: string,
    @Body() dto: StartDto,
    @CurrentUser() a: AuthenticatedUser,
  ) {
    return this.enhancement.start(id, dto, a);
  }
  @Get() status(@Param('id') id: string, @CurrentUser() a: AuthenticatedUser) {
    return this.enhancement.status(id, a);
  }
  @Get('studio/templates') templates(
    @Param('id') id: string,
    @Query() q: StudioCatalogDto,
    @CurrentUser() a: AuthenticatedUser,
  ) {
    return this.enhancement.studioTemplates(id, a, q.group);
  }
  @Get('studio/templates/:templateId') template(
    @Param('id') id: string,
    @Param('templateId') templateId: string,
    @CurrentUser() a: AuthenticatedUser,
  ) {
    return this.enhancement.studioTemplateDetails(id, a, templateId);
  }
  @Post('decision') decide(
    @Param('id') id: string,
    @Body() dto: DecideDto,
    @CurrentUser() a: AuthenticatedUser,
  ) {
    return this.enhancement.decide(id, dto, a);
  }
  @Post(':jobId/cancel') cancel(
    @Param('id') id: string,
    @Param('jobId') job: string,
    @CurrentUser() a: AuthenticatedUser,
  ) {
    return this.enhancement.cancel(id, job, a);
  }
  @Post(':jobId/retry') retry(
    @Param('id') id: string,
    @Param('jobId') job: string,
    @CurrentUser() a: AuthenticatedUser,
  ) {
    return this.enhancement.retry(id, job, a);
  }
  @Get('candidates/:candidateId/preview') preview(
    @Param('id') id: string,
    @Param('candidateId') c: string,
    @Query() q: PreviewDto,
    @CurrentUser() a: AuthenticatedUser,
  ) {
    return this.enhancement.preview(id, c, q.edge === '1024' ? 1024 : 480, a, q.kind === 'mask');
  }
}
@Controller('admin/product-intake/image-enhancement-usage')
@UseGuards(JwtAccessGuard, PermissionsGuard, IntakeEnabledGuard)
@TokenTypes(TokenType.Admin)
@Permissions(P.INTAKE_USE)
export class IntakeEnhancementUsageController {
  constructor(private readonly enhancement: ImageEnhancementService) {}
  @Get() usage(@CurrentUser() actor: AuthenticatedUser) {
    return this.enhancement.usage(actor);
  }
}
@Controller('admin/product-intake/studio-review')
@UseGuards(JwtAccessGuard, PermissionsGuard, IntakeEnabledGuard)
@TokenTypes(TokenType.Admin)
@Permissions(P.INTAKE_USE, P.PRODUCTS_UPLOAD_IMAGES)
export class RealStudioReviewController {
  constructor(private readonly enhancement: ImageEnhancementService) {}
  @Get() list(@CurrentUser() actor: AuthenticatedUser) {
    return this.enhancement.realStudioReview(actor);
  }
  @Post(':photoId/local-preview') preview(
    @Param('photoId') id: string,
    @Body() dto: LocalReviewPreviewDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enhancement.localStudioReviewPreview(
      id,
      dto.templateId,
      dto.templateVersion,
      actor,
    );
  }
}
