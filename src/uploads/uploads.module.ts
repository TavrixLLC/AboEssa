import { Module } from '@nestjs/common';
import { StorageModule } from 'src/files/storage.module';
import { UploadsController } from 'src/uploads/uploads.controller';
import { UploadsService } from 'src/uploads/uploads.service';

@Module({
  imports: [StorageModule],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
