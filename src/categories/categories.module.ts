import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { CategoriesController } from 'src/categories/categories.controller';
import { CategoriesService } from 'src/categories/categories.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}

