import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { SalesSessionQueryDto } from 'src/sales-sessions/dto/sales-session-query.dto';
import { StartSalesSessionDto } from 'src/sales-sessions/dto/start-sales-session.dto';
import { SalesSessionsService } from 'src/sales-sessions/sales-sessions.service';

@ApiTags('Sales sessions')
@ApiBearerAuth()
@Controller('admin/sales-sessions')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
@Permissions(PERMISSIONS.SALES_SESSIONS_MANAGE)
export class SalesSessionsController {
  constructor(private readonly salesSessionsService: SalesSessionsService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start or return the current active sales session' })
  start(
    @Body() dto: StartSalesSessionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.salesSessionsService.start(dto, user.id, request);
  }

  @Post(':id/end')
  @ApiOperation({ summary: 'End an active sales session' })
  end(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.salesSessionsService.end(id, user.id, request);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get the current active sales session' })
  active() {
    return this.salesSessionsService.active();
  }

  @Get()
  @ApiOperation({ summary: 'List sales sessions' })
  findAll(@Query() query: SalesSessionQueryDto) {
    return this.salesSessionsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sales session details and recent sales' })
  findOne(@Param('id') id: string) {
    return this.salesSessionsService.findOne(id);
  }
}

