import { Module } from '@nestjs/common';
import { ReportsController } from 'src/reports/reports.controller';
import { ReportsService } from 'src/reports/reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

