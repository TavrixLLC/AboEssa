import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { VerificationController } from 'src/verification/verification.controller';
import { VerificationService } from 'src/verification/verification.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}

