import { Module } from '@nestjs/common';
import { MediaController } from 'src/files/media.controller';
import { MinioStorageProvider } from 'src/files/minio-storage.provider';
import { STORAGE_PROVIDER } from 'src/files/storage-provider.interface';

@Module({
  controllers: [MediaController],
  providers: [
    MinioStorageProvider,
    { provide: STORAGE_PROVIDER, useExisting: MinioStorageProvider },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
