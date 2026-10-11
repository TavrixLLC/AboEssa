import { HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, LabelStatus, Prisma, ProductListingStatus, SaleSource } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { CheckoutService } from 'src/checkout/checkout.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { toSafeCustomer } from 'src/common/utils/safe-user.util';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { BuyProductDto } from 'src/products/dto/buy-product.dto';
import { CreateProductDto } from 'src/products/dto/create-product.dto';
import { ProductBuyResultDto, ProductResponseDto } from 'src/products/dto/product-response.dto';
import { ProductQueryDto } from 'src/products/dto/product-query.dto';
import { UpdateProductDto } from 'src/products/dto/update-product.dto';
import { SalesService } from 'src/sales/sales.service';
import { SocketsService } from 'src/sockets/sockets.service';
import { sha256 } from 'src/common/security/hash.util';

type ProductWithMobileRelations = Prisma.ProductListingGetPayload<{
  include: {
    category: true;
    soldToCustomer: true;
    soldOrderItem: true;
  };
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
    private readonly auditLogs: AuditLogsService,
    private readonly sockets: SocketsService,
    private readonly notifications: NotificationsService,
    private readonly checkout: CheckoutService,
  ) {}

  async create(dto: CreateProductDto, adminId: string, request: Request) {
    if (!dto.categoryId)
      throw new AppException('Category is required', 'CATEGORY_REQUIRED', HttpStatus.BAD_REQUEST);
    await this.ensureActiveCategory(dto.categoryId);
    const quantity = this.normalizeQuantity(dto.quantity);
    const product = await this.prisma.productListing.create({
      data: {
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        imageUrls: dto.imageUrls ?? [],
        price: dto.price,
        discountPercentage: dto.discountPercentage ?? null,
        totalQuantity: quantity,
        availableQuantity: quantity,
        soldQuantity: 0,
        status: ProductListingStatus.DRAFT,
        createdByAdminId: adminId,
      },
      include: this.productInclude(),
    });
    await this.audit(adminId, 'product.created', product.id, dto, request);
    return this.toProductResponse(product, true);
  }

  async findAll(query: ProductQueryDto, customerVisible = false) {
    const pagination = getPagination(query);
    const where: Prisma.ProductListingWhereInput = {
      status: customerVisible ? ProductListingStatus.ACTIVE : query.status,
      availableQuantity: customerVisible ? { gt: 0 } : undefined,
      categoryId: query.categoryId,
      discountPercentage: query.discountedOnly ? { not: null } : undefined,
      OR: query.search
        ? [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const orderBy = this.getProductOrderBy(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.productListing.findMany({
        where,
        include: this.productInclude(),
        orderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.productListing.count({ where }),
    ]);
    return toPaginatedResult(
      items.map((product) => this.toProductResponse(product, !customerVisible)),
      total,
      pagination.page,
      pagination.limit,
    );
  }

  async findOne(id: string, customerVisible = false) {
    const product = await this.prisma.productListing.findFirstOrThrow({
      where: {
        id,
        status: customerVisible ? ProductListingStatus.ACTIVE : undefined,
        availableQuantity: customerVisible ? { gt: 0 } : undefined,
      },
      include: this.productInclude(),
    });
    return this.toProductResponse(product, !customerVisible);
  }

  async update(id: string, dto: UpdateProductDto, adminId: string, request: Request) {
    const existing = await this.prisma.productListing.findUniqueOrThrow({ where: { id } });
    if (dto.categoryId === '')
      throw new AppException('Category is required', 'CATEGORY_REQUIRED', HttpStatus.BAD_REQUEST);
    if (dto.categoryId) {
      await this.ensureActiveCategory(dto.categoryId);
    }

    const data: Prisma.ProductListingUpdateInput = {
      title: dto.title,
      description: dto.description,
      category: dto.categoryId ? { connect: { id: dto.categoryId } } : undefined,
      imageUrls: dto.imageUrls,
      price: dto.price,
      discountPercentage: dto.discountPercentage,
    };

    if (dto.quantity !== undefined) {
      const quantity = this.normalizeQuantity(dto.quantity);
      const soldQuantity =
        existing.soldQuantity ?? (existing.status === ProductListingStatus.SOLD ? 1 : 0);
      if (quantity < soldQuantity) {
        throw new AppException(
          'Quantity cannot be lower than sold quantity',
          'PRODUCT_QUANTITY_BELOW_SOLD',
          HttpStatus.CONFLICT,
        );
      }
      const availableQuantity = quantity - soldQuantity;
      data.totalQuantity = quantity;
      data.availableQuantity = availableQuantity;
      data.soldQuantity = soldQuantity;
      if (existing.status === ProductListingStatus.ACTIVE && availableQuantity === 0) {
        data.status = ProductListingStatus.SOLD;
      }
      if (existing.status === ProductListingStatus.SOLD && availableQuantity > 0) {
        data.status = ProductListingStatus.ACTIVE;
      }
    }

    const product = await this.prisma.productListing.update({
      where: { id },
      data,
      include: this.productInclude(),
    });
    await this.audit(adminId, 'product.updated', product.id, dto, request);
    return this.toProductResponse(product, true);
  }

  async publish(id: string, adminId: string, request: Request) {
    const existing = await this.prisma.productListing.findUniqueOrThrow({ where: { id } });
    await this.ensureActiveCategory(existing.categoryId);
    if (existing.availableQuantity <= 0) {
      throw new AppException(
        'Product is out of stock',
        'PRODUCT_OUT_OF_STOCK',
        HttpStatus.CONFLICT,
      );
    }
    const product = await this.prisma.productListing.update({
      where: { id },
      data: { status: ProductListingStatus.ACTIVE, publishedAt: new Date() },
      include: this.productInclude(),
    });
    await this.audit(adminId, 'product.published', product.id, {}, request);
    return this.toProductResponse(product, true);
  }

  async cancel(id: string, adminId: string, request: Request) {
    const existing = await this.prisma.productListing.findUniqueOrThrow({ where: { id } });
    if (existing.status === ProductListingStatus.SOLD) {
      throw new AppException(
        'Sold products cannot be cancelled',
        'PRODUCT_ALREADY_SOLD',
        HttpStatus.CONFLICT,
      );
    }
    const product = await this.prisma.productListing.update({
      where: { id },
      data: { status: ProductListingStatus.CANCELLED },
      include: this.productInclude(),
    });
    await this.audit(adminId, 'product.cancelled', product.id, {}, request);
    return this.toProductResponse(product, true);
  }

  async buy(
    productId: string,
    customerId: string,
    request: Request,
    dto: BuyProductDto,
    idempotencyKey?: string,
  ) {
    const quantity = this.normalizeQuantity(dto.quantity);
    let transactionResult: Awaited<ReturnType<typeof this.claimInventoryAndCreateSale>>;
    try {
      transactionResult = await this.claimInventoryAndCreateSale(
        productId,
        customerId,
        quantity,
        dto,
        idempotencyKey,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new AppException(
          'Purchase changed concurrently; please retry',
          'PURCHASE_CONFLICT_RETRY',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    await this.salesService.recordSoldItemSideEffects(
      {
        customerId,
        categoryId: transactionResult.product.categoryId,
        productListingId: transactionResult.product.id,
        source: SaleSource.APP_FIXED_PRICE,
        price: transactionResult.unitPrice,
        quantity: transactionResult.quantity,
        title: transactionResult.product.title,
        shouldCreatePrintJob: false,
        initialLabelStatus: LabelStatus.PENDING,
      },
      transactionResult.sale,
      {
        actorType: ActorType.CUSTOMER,
        actorId: customerId,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
      'product.sold',
    );

    this.sockets.emitToAdmins(
      'shipping_request_created',
      transactionResult.checkout.shipmentRequest,
    );
    await this.auditLogs.create({
      actorType: ActorType.CUSTOMER,
      actorId: customerId,
      action: 'product.checkout_confirmed',
      entityType: 'OrderItem',
      entityId: transactionResult.sale.items[0].id,
      metadata: {
        productId,
        paymentMethod: dto.paymentMethod,
        walletPaidAmount: transactionResult.checkout.walletPaid.toFixed(2),
        cashDueAmount: transactionResult.checkout.cashDue.toFixed(2),
      },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    this.sockets.emitToAdmins('product_sold', {
      productId,
      customerId,
      orderItemId: transactionResult.sale.items[0].id,
      quantity: transactionResult.quantity,
      remainingQuantity: transactionResult.remainingQuantity,
    });
    this.sockets.emitToCustomers('product_sold', {
      productId,
      orderItemId: transactionResult.sale.items[0].id,
      quantity: transactionResult.quantity,
      remainingQuantity: transactionResult.remainingQuantity,
      soldAt: transactionResult.sale.items[0].soldAt.toISOString(),
    });
    await this.notifications.createForCustomer({
      customerId,
      type: 'ORDER_UPDATED',
      title: 'Product purchased',
      body: transactionResult.product.title,
      data: { productId, orderItemId: transactionResult.sale.items[0].id },
    });

    const product = await this.prisma.productListing.findUniqueOrThrow({
      where: { id: productId },
      include: this.productInclude(),
    });
    const sale = this.salesService.toPublicSaleResult(transactionResult.sale);
    const item = sale.items[0];
    const totalPrice = transactionResult.unitPrice.mul(transactionResult.quantity);

    return {
      productId,
      orderItemId: item.id,
      orderId: item.orderId,
      labelStatus: item.labelStatus,
      customerId: item.customerId,
      price: this.toMoney(item.price),
      requestedQuantity: transactionResult.quantity,
      purchasedQuantity: sale.items.length,
      remainingQuantity: transactionResult.remainingQuantity,
      unitPrice: this.toMoney(transactionResult.unitPrice),
      totalPrice: this.toMoney(totalPrice),
      paymentMethod: dto.paymentMethod,
      walletPaidAmount: this.toMoney(transactionResult.checkout.walletPaid),
      cashDueAmount: this.toMoney(transactionResult.checkout.cashDue),
      shipmentRequestId: transactionResult.checkout.shipmentRequest.id,
      orderItems: sale.items,
      purchasedAt: item.soldAt,
      status: 'AWAITING_FULFILLMENT',
      message: 'Order confirmed and waiting for fulfillment',
      product: this.toProductResponse(product, false),
      sale,
      item,
      orderItem: item,
    } satisfies ProductBuyResultDto & { item: unknown; orderItem: unknown };
  }

  private claimInventoryAndCreateSale(
    productId: string,
    customerId: string,
    quantity: number,
    dto: BuyProductDto,
    idempotencyKey?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const product = await tx.productListing.findUnique({ where: { id: productId } });
        if (!product) {
          throw new AppException(
            'Product was not found',
            'PRODUCT_NOT_FOUND',
            HttpStatus.NOT_FOUND,
          );
        }
        if (product.status !== ProductListingStatus.ACTIVE || product.availableQuantity <= 0) {
          throw new AppException(
            'Product already sold',
            'PRODUCT_ALREADY_SOLD',
            HttpStatus.CONFLICT,
          );
        }
        if (product.availableQuantity < quantity) {
          throw new AppException(
            'Insufficient product stock',
            'INSUFFICIENT_PRODUCT_STOCK',
            HttpStatus.CONFLICT,
          );
        }

        const unitPrice = this.discountedPrice(product.price, product.discountPercentage);

        const soldAt = product.soldAt ?? new Date();
        const remainingQuantity = product.availableQuantity - quantity;

        const claimed = await tx.productListing.updateMany({
          where: {
            id: productId,
            status: ProductListingStatus.ACTIVE,
            availableQuantity: { gte: quantity },
          },
          data: {
            availableQuantity: { decrement: quantity },
            soldQuantity: { increment: quantity },
            status:
              remainingQuantity === 0 ? ProductListingStatus.SOLD : ProductListingStatus.ACTIVE,
            soldToCustomerId: product.soldToCustomerId ?? customerId,
            soldAt,
          },
        });
        if (claimed.count !== 1) {
          throw new AppException(
            'Insufficient product stock',
            'INSUFFICIENT_PRODUCT_STOCK',
            HttpStatus.CONFLICT,
          );
        }

        const sale = await this.salesService.createSoldItemInTransaction(tx, {
          customerId,
          categoryId: product.categoryId,
          productListingId: product.id,
          source: SaleSource.APP_FIXED_PRICE,
          price: unitPrice,
          quantity,
          title: product.title,
          description: product.description ?? undefined,
          imageUrl: product.imageUrls[0],
          shouldCreatePrintJob: false,
          initialLabelStatus: LabelStatus.PENDING,
          dedicatedOrder: true,
        });

        const checkout = await this.checkout.complete(tx, {
          customerId,
          orderId: sale.items[0].orderId,
          itemIds: sale.items.map((item) => item.id),
          totalAmount: unitPrice.mul(quantity),
          paymentMethod: dto.paymentMethod,
          delivery: dto.delivery,
          referenceId: sale.items[0].id,
          eventKey: idempotencyKey
            ? `product-buy:${customerId}:${sha256(`${productId}:${idempotencyKey}`)}`
            : `product-buy:${sale.items[0].id}`,
        });

        if (!product.soldOrderItemId) {
          await tx.productListing.update({
            where: { id: product.id },
            data: { soldOrderItemId: sale.items[0].id },
          });
        }

        return {
          product,
          sale: {
            ...sale,
            items: checkout.updatedItems ?? sale.items,
            order: checkout.updatedOrder ?? sale.order,
          },
          checkout,
          unitPrice,
          quantity,
          remainingQuantity,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  toProductResponse(product: ProductWithMobileRelations, adminContext = false): ProductResponseDto {
    const originalPrice = new Prisma.Decimal(product.price);
    const discountedPrice = this.discountedPrice(originalPrice, product.discountPercentage);
    const response: ProductResponseDto = {
      id: product.id,
      title: product.title,
      description: product.description,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? null,
      imageUrls: product.imageUrls,
      primaryImageUrl: product.imageUrls[0] ?? null,
      price: this.toMoney(adminContext ? originalPrice : discountedPrice),
      originalPrice: this.toMoney(originalPrice),
      discountedPrice: this.toMoney(discountedPrice),
      discountPercentage: product.discountPercentage ?? null,
      hasDiscount: product.discountPercentage != null,
      totalQuantity: product.totalQuantity,
      availableQuantity: product.availableQuantity,
      soldQuantity: product.soldQuantity,
      status: product.status,
      isAvailable: product.status === ProductListingStatus.ACTIVE && product.availableQuantity > 0,
      isOutOfStock: product.availableQuantity <= 0,
      soldAt: product.soldAt,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };

    if (adminContext) {
      response.saleSource = product.soldOrderItem?.source ?? null;
      response.buyerCustomerId = product.soldToCustomerId;
      response.buyerCustomer = product.soldToCustomer
        ? toSafeCustomer(product.soldToCustomer)
        : null;
      response.orderItemId = product.soldOrderItemId;
      response.labelStatus = product.soldOrderItem?.labelStatus ?? null;
    }

    return response;
  }

  private productInclude() {
    return {
      category: true,
      soldToCustomer: true,
      soldOrderItem: true,
    } satisfies Prisma.ProductListingInclude;
  }

  private async ensureActiveCategory(categoryId: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new AppException('Category was not found', 'CATEGORY_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (!category.isActive) {
      throw new AppException('Category is inactive', 'CATEGORY_INACTIVE', HttpStatus.CONFLICT);
    }
  }

  private normalizeQuantity(quantity?: number) {
    const normalized = quantity ?? 1;
    if (!Number.isInteger(normalized) || normalized < 1) {
      throw new AppException(
        'Quantity must be at least 1',
        'INVALID_PRODUCT_QUANTITY',
        HttpStatus.BAD_REQUEST,
      );
    }
    return normalized;
  }

  private getProductOrderBy(
    query: ProductQueryDto,
  ): Prisma.ProductListingOrderByWithRelationInput[] {
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    if (sortBy === 'publishedAt') {
      return [{ publishedAt: sortOrder }, { createdAt: 'desc' }, { id: 'asc' }];
    }
    return [{ [sortBy]: sortOrder }, { createdAt: 'desc' }, { id: 'asc' }];
  }

  private toMoney(value: Prisma.Decimal | number | string) {
    return new Prisma.Decimal(value).toFixed(2);
  }

  private discountedPrice(
    price: Prisma.Decimal | number | string,
    discountPercentage: number | null | undefined,
  ) {
    const original = new Prisma.Decimal(price);
    if (discountPercentage == null) {
      return original;
    }
    return original
      .mul(100 - discountPercentage)
      .div(100)
      .toDecimalPlaces(2);
  }

  private audit(
    adminId: string,
    action: string,
    productId: string,
    metadata: unknown,
    request: Request,
  ) {
    return this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action,
      entityType: 'ProductListing',
      entityId: productId,
      metadata: metadata as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
