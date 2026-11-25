import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { StorageModule } from 'src/files/storage.module';
import { MAX_IMAGE_BYTES } from 'src/image-optimization/image-recipe';
import { UploadsController } from 'src/uploads/uploads.controller';
import { UploadsService } from 'src/uploads/uploads.service';

@Module({
  imports: [
    StorageModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: Math.min(config.get<number>('upload.maxBytes') ?? 5_242_880, MAX_IMAGE_BYTES),
          files: 1,
          fields: 1,
          fieldSize: 128,
        },
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
