import { Module } from '@nestjs/common';
import { StorageModule } from 'src/files/storage.module';
import { ImageOptimizationRuntime } from './image-optimization.runtime';
import { ImageOptimizationService } from './image-optimization.service';
import { ImageVariantsController } from './image-variants.controller';

@Module({
  imports: [StorageModule],
  controllers: [ImageVariantsController],
  providers: [ImageOptimizationService, ImageOptimizationRuntime],
})
export class ImageOptimizationModule {}
