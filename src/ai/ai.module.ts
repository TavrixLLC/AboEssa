import { Module } from '@nestjs/common';
import { StorageModule } from 'src/files/storage.module';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { GeminiRecognitionProvider, MockRecognitionProvider } from './recognition.provider';
import { RecognitionBudgetService } from './recognition-budget.service';
import { RecognitionService } from './recognition.service';
import { RecognitionRuntime } from './recognition.runtime';
@Module({
  imports: [StorageModule],
  providers: [
    DuplicateDetectionService,
    GeminiRecognitionProvider,
    MockRecognitionProvider,
    RecognitionBudgetService,
    RecognitionService,
    RecognitionRuntime,
  ],
  exports: [RecognitionService, DuplicateDetectionService, RecognitionBudgetService],
})
export class AiModule {}
