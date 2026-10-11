import { DocumentBuilder } from '@nestjs/swagger';

export function buildOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('Shanashil Commerce API')
    .setDescription(
      'REST and realtime backend for one-store commerce, customer password login, RBAC administration, sales, warehouse, labels, auctions, notifications, and reporting.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
}
