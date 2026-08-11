import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { CustomersController } from 'src/customers/customers.controller';
import { CustomersService } from 'src/customers/customers.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}

