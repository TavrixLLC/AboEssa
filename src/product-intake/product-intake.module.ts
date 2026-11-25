import { Module } from '@nestjs/common';
import { InventoryModule } from 'src/inventory/inventory.module';
import { ProductsModule } from 'src/products/products.module';
import { UploadsModule } from 'src/uploads/uploads.module';
import { StorageModule } from 'src/files/storage.module';
import { IntakeEnabledGuard, ProductIntakeController } from './product-intake.controller';
import { ProductIntakeService } from './product-intake.service';
import { AiModule } from 'src/ai/ai.module';
import { IntakeRecognitionController } from './intake-recognition.controller';
import {
  IntakeEnhancementController,
  IntakeEnhancementUsageController,
  RealStudioReviewController,
} from './intake-enhancement.controller';
import { ImageEnhancementModule } from 'src/image-enhancement/enhancement.module';
@Module({
  imports: [
    InventoryModule,
    ProductsModule,
    UploadsModule,
    StorageModule,
    AiModule,
    ImageEnhancementModule,
  ],
  controllers: [
    ProductIntakeController,
    IntakeRecognitionController,
    IntakeEnhancementController,
    IntakeEnhancementUsageController,
    RealStudioReviewController,
  ],
  providers: [ProductIntakeService, IntakeEnabledGuard],
  exports: [ProductIntakeService],
})
export class ProductIntakeModule {}
