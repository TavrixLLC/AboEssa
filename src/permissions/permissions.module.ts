import { Global, Module } from '@nestjs/common';
import { PermissionsController } from 'src/permissions/permissions.controller';
import { PermissionResolverService } from 'src/permissions/permission-resolver.service';

@Global()
@Module({
  controllers: [PermissionsController],
  providers: [PermissionResolverService],
  exports: [PermissionResolverService],
})
export class PermissionsModule {}
