import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { LabelJobQueryDto } from 'src/labels/dto/label-job-query.dto';
import { MarkLabelFailedDto } from 'src/labels/dto/mark-label-failed.dto';
import { LabelsService } from 'src/labels/labels.service';

@ApiTags('Labels')
@ApiBearerAuth()
@Controller('admin/labels/jobs')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Get()
  @Permissions(PERMISSIONS.WAREHOUSE_READ)
  @ApiOperation({ summary: 'List label print jobs' })
  findAll(@Query() query: LabelJobQueryDto) {
    return this.labelsService.findAll(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.WAREHOUSE_READ)
  @ApiOperation({ summary: 'Get label print job details' })
  findOne(@Param('id') id: string) {
    return this.labelsService.findOne(id);
  }

  @Post(':id/mark-printed')
  @Permissions(PERMISSIONS.WAREHOUSE_PRINT_LABEL)
  @ApiOperation({ summary: 'Mark label print job as printed' })
  markPrinted(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.labelsService.markPrinted(id, user.id);
  }

  @Post(':id/mark-failed')
  @Permissions(PERMISSIONS.WAREHOUSE_PRINT_LABEL)
  @ApiOperation({ summary: 'Mark label print job as failed' })
  markFailed(@Param('id') id: string, @Body() dto: MarkLabelFailedDto, @CurrentUser() user: AuthenticatedUser) {
    return this.labelsService.markFailed(id, user.id, dto.error);
  }

  @Post(':id/confirm-attached')
  @Permissions(PERMISSIONS.WAREHOUSE_CONFIRM_LABEL)
  @ApiOperation({ summary: 'Confirm label was attached to the physical item' })
  confirmAttached(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.labelsService.confirmAttached(id, user.id);
  }
}

