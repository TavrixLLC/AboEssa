import { Module } from '@nestjs/common';
import { StorageModule } from 'src/files/storage.module';
import { AiModule } from 'src/ai/ai.module';
import { ImageEnhancementService } from './enhancement.service';
import { ImageEnhancementRuntime } from './enhancement.runtime';
import { ImageEditingProvider } from './enhancement.provider';
@Module({
  imports: [StorageModule, AiModule],
  providers: [ImageEnhancementService, ImageEnhancementRuntime, ImageEditingProvider],
  exports: [ImageEnhancementService],
})
export class ImageEnhancementModule {}
