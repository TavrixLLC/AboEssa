import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from 'src/config/configuration';
import { envValidationSchema } from 'src/config/env.validation';
import { AdminAuthModule } from 'src/admin-auth/admin-auth.module';
import { AdminUsersModule } from 'src/admin-users/admin-users.module';
import { AdsModule } from 'src/ads/ads.module';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { AuthModule } from 'src/auth/auth.module';
import { AuctionsModule } from 'src/auctions/auctions.module';
import { CategoriesModule } from 'src/categories/categories.module';
import { RequestIdMiddleware } from 'src/common/middleware/request-id.middleware';
import { CustomerAuthModule } from 'src/customer-auth/customer-auth.module';
import { CustomerAddressesModule } from 'src/customer-addresses/customer-addresses.module';
import { CustomersModule } from 'src/customers/customers.module';
import { HealthModule } from 'src/health/health.module';
import { InfluencersModule } from 'src/influencers/influencers.module';
import { LabelsModule } from 'src/labels/labels.module';
import { MarketplaceModule } from 'src/marketplace/marketplace.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { OrdersModule } from 'src/orders/orders.module';
import { PermissionsModule } from 'src/permissions/permissions.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ProductsModule } from 'src/products/products.module';
import { ReportsModule } from 'src/reports/reports.module';
import { SalesModule } from 'src/sales/sales.module';
import { SalesSessionsModule } from 'src/sales-sessions/sales-sessions.module';
import { ScreensModule } from 'src/screens/screens.module';
import { SettingsModule } from 'src/settings/settings.module';
import { ShippingModule } from 'src/shipping/shipping.module';
import { SocketsModule } from 'src/sockets/sockets.module';
import { TimeModule } from 'src/time/time.module';
import { UploadsModule } from 'src/uploads/uploads.module';
import { VerificationModule } from 'src/verification/verification.module';
import { WarehouseModule } from 'src/warehouse/warehouse.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttl') ?? 60_000,
          limit: config.get<number>('throttle.limit') ?? 120,
        },
      ],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url') || 'redis://localhost:6379',
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    AuditLogsModule,
    HealthModule,
    TimeModule,
    AdminAuthModule,
    PermissionsModule,
    CustomerAuthModule,
    CustomerAddressesModule,
    AdminUsersModule,
    CustomersModule,
    VerificationModule,
    SettingsModule,
    CategoriesModule,
    SocketsModule,
    NotificationsModule,
    SalesSessionsModule,
    LabelsModule,
    SalesModule,
    ProductsModule,
    AuctionsModule,
    MarketplaceModule,
    UploadsModule,
    InfluencersModule,
    AdsModule,
    ShippingModule,
    ReportsModule,
    WarehouseModule,
    OrdersModule,
    ScreensModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
