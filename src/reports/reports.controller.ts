import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { DateRangeQueryDto } from 'src/reports/dto/date-range-query.dto';
import { ReportsService } from 'src/reports/reports.service';

@ApiTags('Dashboard and reports')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@TokenTypes(TokenType.Admin)
@Permissions(PERMISSIONS.REPORTS_READ)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard/stats')
  @Permissions(PERMISSIONS.DASHBOARD_VIEW)
  dashboard() {
    return this.reportsService.dashboardStats();
  }

  @Get('reports/sales')
  sales(@Query() query: DateRangeQueryDto) {
    return this.reportsService.sales(query);
  }

  @Get('reports/categories')
  categories(@Query() query: DateRangeQueryDto) {
    return this.reportsService.categories(query);
  }

  @Get('reports/customers')
  customers(@Query() query: DateRangeQueryDto) {
    return this.reportsService.customers(query);
  }

  @Get('reports/warehouse')
  warehouse() {
    return this.reportsService.warehouse();
  }

  @Get('reports/influencers')
  influencers(@Query() query: DateRangeQueryDto) {
    return this.reportsService.influencers(query);
  }

  @Get('reports/auctions')
  auctions(@Query() query: DateRangeQueryDto) {
    return this.reportsService.auctions(query);
  }
}
