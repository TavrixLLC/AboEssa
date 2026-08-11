import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { SecurityModule } from 'src/common/security/security.module';
import { AdminUsersController } from 'src/admin-users/admin-users.controller';
import { AdminUsersService } from 'src/admin-users/admin-users.service';
import { StaffService } from 'src/admin-users/staff.service';
import { StaffController } from 'src/admin-users/staff.controller';
import { RolesService } from 'src/admin-users/roles.service';
import { RolesController } from 'src/admin-users/roles.controller';
import { SocketsModule } from 'src/sockets/sockets.module';

@Module({
  imports: [AuditLogsModule, SecurityModule, SocketsModule],
  controllers: [AdminUsersController, StaffController, RolesController],
  providers: [AdminUsersService, StaffService, RolesService],
  exports: [StaffService],
})
export class AdminUsersModule {}
