import { Injectable } from '@nestjs/common';
import { RegisterCustomerDeviceDto } from 'src/notifications/dto/customer-device.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CustomerDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(customerId: string, dto: RegisterCustomerDeviceDto) {
    const now = new Date();
    const device = await this.prisma.$transaction(async (tx) => {
      await tx.customerDevice.deleteMany({
        where: {
          pushToken: dto.token,
          installationId: { not: dto.installationId },
        },
      });
      return tx.customerDevice.upsert({
        where: { installationId: dto.installationId },
        create: {
          customerId,
          installationId: dto.installationId,
          platform: dto.platform,
          pushToken: dto.token,
          preferredLocale: dto.preferredLocale,
          enabled: true,
          lastSeenAt: now,
        },
        update: {
          customerId,
          platform: dto.platform,
          pushToken: dto.token,
          preferredLocale: dto.preferredLocale,
          enabled: true,
          lastSeenAt: now,
        },
      });
    });
    return this.safe(device);
  }

  async unregister(customerId: string, installationId: string) {
    await this.prisma.customerDevice.deleteMany({ where: { customerId, installationId } });
    return { unregistered: true };
  }

  private safe(device: {
    installationId: string;
    platform: string;
    preferredLocale: string;
    enabled: boolean;
    updatedAt: Date;
  }) {
    return {
      installationId: device.installationId,
      platform: device.platform,
      preferredLocale: device.preferredLocale,
      enabled: device.enabled,
      updatedAt: device.updatedAt,
    };
  }
}
