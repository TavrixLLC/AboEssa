import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import {
  successEnvelopeSchema,
  unitSuccessEnvelopeSchema,
} from 'src/common/swagger/response-envelope.schema';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { NotificationQueryDto } from 'src/notifications/dto/notification-query.dto';
import {
  NotificationBatchReadResponseDto,
  NotificationListResponseDto,
  NotificationSettingsResponseDto,
  NotificationUnreadCountResponseDto,
} from 'src/notifications/dto/notification-response.dto';
import { ReadBatchNotificationsDto } from 'src/notifications/dto/read-batch-notifications.dto';
import { UpdateNotificationSettingsDto } from 'src/notifications/dto/update-notification-settings.dto';
import { NotificationsService } from 'src/notifications/notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@ApiExtraModels(
  NotificationListResponseDto,
  NotificationSettingsResponseDto,
  NotificationUnreadCountResponseDto,
  NotificationBatchReadResponseDto,
)
@Controller()
@UseGuards(JwtAccessGuard)
@TokenTypes(TokenType.Customer)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('notifications')
  @ApiOperation({ summary: 'List customer notifications' })
  @ApiOkResponse({ schema: successEnvelopeSchema(NotificationListResponseDto) })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: NotificationQueryDto) {
    return this.notificationsService.listCustomer(user.id, query);
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Get the authenticated customer unread notification count' })
  @ApiOkResponse({ schema: successEnvelopeSchema(NotificationUnreadCountResponseDto) })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Post('notifications/read-batch')
  @ApiOperation({ summary: 'Mark only the supplied loaded notifications as read' })
  @ApiOkResponse({ schema: successEnvelopeSchema(NotificationBatchReadResponseDto) })
  readBatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReadBatchNotificationsDto) {
    return this.notificationsService.readBatch(user.id, dto.ids);
  }

  @Post('notifications/:id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiOkResponse({ schema: unitSuccessEnvelopeSchema() })
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.id, id);
  }

  @Get('customer/notification-settings')
  @ApiOperation({ summary: 'Get customer notification settings' })
  @ApiOkResponse({ schema: successEnvelopeSchema(NotificationSettingsResponseDto) })
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getSettings(user.id);
  }

  @Patch('customer/notification-settings')
  @ApiOperation({ summary: 'Update customer notification settings' })
  @ApiOkResponse({ schema: successEnvelopeSchema(NotificationSettingsResponseDto) })
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notificationsService.updateSettings(user.id, dto);
  }
}
