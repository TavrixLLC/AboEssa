import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { AuditLogQueryDto } from 'src/audit-logs/dto/audit-log-query.dto';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';

@ApiTags('Audit logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Permissions(PERMISSIONS.AUDIT_LOGS_VIEW)
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLogsService.findAll(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.AUDIT_LOGS_VIEW)
  findOne(@Param('id') id: string) {
    return this.auditLogsService.findOne(id);
  }
}
