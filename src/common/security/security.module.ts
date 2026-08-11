import { Module } from '@nestjs/common';
import { PasswordService } from 'src/common/security/password.service';

@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class SecurityModule {}

