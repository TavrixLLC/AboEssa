import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from 'src/common/exceptions/app.exception';
import { CreateCustomerAddressDto } from 'src/customer-addresses/dto/create-customer-address.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CustomerAddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(customerId: string, dto: CreateCustomerAddressDto) {
    if (dto.isDefault) {
      await this.prisma.customerAddress.updateMany({ where: { customerId, isActive: true }, data: { isDefault: false } });
    }
    return this.prisma.customerAddress.create({ data: { ...dto, customerId, isDefault: dto.isDefault ?? false, isActive: true } });
  }

  list(customerId: string) {
    return this.prisma.customerAddress.findMany({ where: { customerId, isActive: true }, orderBy: { createdAt: 'desc' } });
  }

  async update(customerId: string, id: string, dto: Partial<CreateCustomerAddressDto>) {
    const existing = await this.prisma.customerAddress.findFirst({ where: { id, customerId, isActive: true } });
    if (!existing) throw new AppException('Address was not found', 'ADDRESS_NOT_FOUND', HttpStatus.NOT_FOUND);
    if (dto.isDefault) await this.prisma.customerAddress.updateMany({ where: { customerId, isActive: true }, data: { isDefault: false } });
    return this.prisma.customerAddress.update({ where: { id }, data: { ...dto, isDefault: dto.isDefault ?? existing.isDefault } });
  }

  async remove(customerId: string, id: string) {
    const existing = await this.prisma.customerAddress.findFirst({ where: { id, customerId, isActive: true } });
    if (!existing) throw new AppException('Address was not found', 'ADDRESS_NOT_FOUND', HttpStatus.NOT_FOUND);
    return this.prisma.customerAddress.update({ where: { id }, data: { isActive: false, isDefault: false } });
  }

  async setDefault(customerId: string, id: string) {
    const existing = await this.prisma.customerAddress.findFirst({ where: { id, customerId, isActive: true } });
    if (!existing) throw new AppException('Address was not found', 'ADDRESS_NOT_FOUND', HttpStatus.NOT_FOUND);
    return this.prisma.$transaction(async (tx) => {
      await tx.customerAddress.updateMany({ where: { customerId, isActive: true }, data: { isDefault: false } });
      return tx.customerAddress.update({ where: { id }, data: { isDefault: true } });
    });
  }
}
