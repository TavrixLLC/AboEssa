import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';
import { successEnvelopeSchema } from 'src/common/swagger/response-envelope.schema';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { AdminNotificationsService } from 'src/notifications/admin-notifications.service';
import {
  AdminNotificationCampaignListResponseDto,
  AdminNotificationCampaignResponseDto,
  AdminNotificationHistoryQueryDto,
  AdminNotificationSendResponseDto,
  AudiencePreviewDto,
  AudiencePreviewResponseDto,
  SendAdminNotificationDto,
} from 'src/notifications/dto/admin-notification.dto';

@ApiTags('Admin notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'The required notification permission is missing' })
@ApiExtraModels(
  AudiencePreviewResponseDto,
  AdminNotificationSendResponseDto,
  AdminNotificationCampaignResponseDto,
  AdminNotificationCampaignListResponseDto,
)
@Controller('admin/notifications')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
export class AdminNotificationsController {
  constructor(
    private readonly service: AdminNotificationsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('audience-preview')
  @Permissions(PERMISSIONS.NOTIFICATIONS_SEND)
  @ApiOperation({ summary: 'Preview the authoritative eligible recipient count' })
  @ApiOkResponse({ schema: successEnvelopeSchema(AudiencePreviewResponseDto) })
  preview(@Body() dto: AudiencePreviewDto) {
    return this.service.preview(dto);
  }

  @Post('send')
  @Permissions(PERMISSIONS.NOTIFICATIONS_SEND)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Persist and send an in-app notification campaign' })
  @ApiOkResponse({ schema: successEnvelopeSchema(AdminNotificationSendResponseDto) })
  send(
    @Body() dto: SendAdminNotificationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: Request,
  ) {
    const idempotencyKey = this.idempotency.requireKey(headers);
    const requestHash = this.idempotency.hashBody(dto);
    return this.service.send(dto, user.id, idempotencyKey, requestHash, request);
  }

  @Get()
  @Permissions(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'List admin notification campaigns' })
  @ApiOkResponse({ schema: successEnvelopeSchema(AdminNotificationCampaignListResponseDto) })
  list(@Query() query: AdminNotificationHistoryQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get an admin notification campaign summary' })
  @ApiOkResponse({ schema: successEnvelopeSchema(AdminNotificationCampaignResponseDto) })
  details(@Param('id') id: string) {
    return this.service.details(id);
  }
}
