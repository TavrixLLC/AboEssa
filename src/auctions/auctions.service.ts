import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActorType,
  AuctionStatus,
  AuctionTier,
  BidStatus,
  CheckoutStatus,
  CustomerStatus,
  LabelStatus,
  NotificationType,
  Prisma,
  SaleSource,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { CheckoutService } from 'src/checkout/checkout.service';
import { CheckoutDto } from 'src/checkout/dto/checkout.dto';
import { AUCTION_CLOSE_QUEUE } from 'src/auctions/auction-queue.constants';
import {
  legacyAdminAuctionRarity,
  normalizeAuctionRarity,
} from 'src/auctions/auction-rarity.compat';
import { AuctionQueryDto } from 'src/auctions/dto/auction-query.dto';
import {
  AuctionResponseDto,
  BidResponseDto,
  PlaceBidResultDto,
} from 'src/auctions/dto/auction-response.dto';
import { CreateAuctionDto } from 'src/auctions/dto/create-auction.dto';
import { PlaceBidDto } from 'src/auctions/dto/place-bid.dto';
import { UpdateAuctionDto } from 'src/auctions/dto/update-auction.dto';
import { APP_SETTINGS_ID } from 'src/common/constants/app.constants';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { AppException } from 'src/common/exceptions/app.exception';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { toSafeCustomer } from 'src/common/utils/safe-user.util';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SalesService } from 'src/sales/sales.service';
import { SocketsService } from 'src/sockets/sockets.service';
import { WalletService } from 'src/wallet/wallet.service';
import { sha256 } from 'src/common/security/hash.util';

@Injectable()
export class AuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
    private readonly auditLogs: AuditLogsService,
    private readonly sockets: SocketsService,
    private readonly notifications: NotificationsService,
    @InjectQueue(AUCTION_CLOSE_QUEUE) private readonly closeQueue: Queue,
    private readonly wallet: WalletService,
    private readonly checkout: CheckoutService,
  ) {}

  async create(
    dto: CreateAuctionDto,
    adminId: string,
    request: Request,
    adminUser?: { role?: string; permissions?: string[] },
  ) {
    const settings = await this.getSettings();
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new AppException(
        'Auction end must be after start',
        'INVALID_AUCTION_TIME',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!dto.categoryId)
      throw new AppException('Category is required', 'CATEGORY_REQUIRED', HttpStatus.BAD_REQUEST);
    await this.ensureActiveCategory(dto.categoryId);
    const tier = dto.tier ?? AuctionTier.NORMAL;
    this.assertVipPermission(tier, adminUser);
    const auction = await this.prisma.auction.create({
      data: {
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        imageUrls: dto.imageUrls ?? [],
        startingPrice: dto.startingPrice,
        currentPrice: dto.startingPrice,
        minIncrement: dto.minIncrement,
        status: AuctionStatus.DRAFT,
        tier,
        rarity: normalizeAuctionRarity(dto.rarity) ?? null,
        startsAt,
        endsAt,
        originalEndsAt: endsAt,
        extensionSeconds: dto.extensionSeconds ?? settings.defaultAuctionExtensionSeconds,
        extensionTriggerSeconds:
          dto.extensionTriggerSeconds ?? settings.defaultAuctionExtensionTriggerSeconds,
        maxExtensions: dto.maxExtensions ?? settings.maxAuctionExtensions,
        createdByAdminId: adminId,
      },
      include: this.auctionInclude(),
    });
    await this.audit(adminId, 'auction.created', auction.id, dto, request);
    return this.toAuctionResponse(auction, { adminContext: true });
  }

  async update(
    id: string,
    dto: UpdateAuctionDto,
    adminId: string,
    request: Request,
    adminUser?: { role?: string; permissions?: string[] },
  ) {
    const existing = await this.prisma.auction.findUniqueOrThrow({ where: { id } });
    if (existing.status !== AuctionStatus.DRAFT) {
      throw new AppException(
        'Only draft auctions can be edited',
        'AUCTION_NOT_EDITABLE',
        HttpStatus.CONFLICT,
      );
    }
    if (dto.categoryId === '')
      throw new AppException('Category is required', 'CATEGORY_REQUIRED', HttpStatus.BAD_REQUEST);
    if (dto.categoryId) {
      await this.ensureActiveCategory(dto.categoryId);
    }
    if (dto.tier !== undefined && dto.tier !== existing.tier) {
      this.assertVipPermission(dto.tier, adminUser);
    }
    const auction = await this.prisma.auction.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        tier: dto.tier,
        rarity: normalizeAuctionRarity(dto.rarity),
        imageUrls: dto.imageUrls,
        startingPrice: dto.startingPrice,
        currentPrice: dto.startingPrice,
        minIncrement: dto.minIncrement,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        originalEndsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        extensionSeconds: dto.extensionSeconds,
        extensionTriggerSeconds: dto.extensionTriggerSeconds,
        maxExtensions: dto.maxExtensions,
      },
      include: this.auctionInclude(),
    });
    await this.audit(adminId, 'auction.updated', id, dto, request);
    return this.toAuctionResponse(auction, { adminContext: true });
  }

  async publish(id: string, adminId: string, request: Request) {
    const auction = await this.prisma.auction.update({
      where: { id },
      data: { status: AuctionStatus.ACTIVE },
      include: this.auctionInclude(),
    });
    await this.scheduleClose(auction.id, auction.endsAt);
    await this.audit(adminId, 'auction.published', auction.id, {}, request);
    const response = this.toAuctionResponse(auction, { adminContext: true });
    this.sockets.emitToAdmins('auction_updated', response);
    this.sockets.emitToCustomers('auction_updated', response);
    return response;
  }

  async cancel(id: string, adminId: string, request: Request) {
    const auction = await this.prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Auction" WHERE id = ${id} FOR UPDATE`;
          const existing = await tx.auction.findUnique({
            where: { id },
            include: { winningBid: true },
          });
          if (!existing) {
            throw new AppException(
              'Auction was not found',
              'AUCTION_NOT_FOUND',
              HttpStatus.NOT_FOUND,
            );
          }
          if (existing.status === AuctionStatus.ENDED) {
            throw new AppException('Auction has ended', 'AUCTION_ENDED', HttpStatus.CONFLICT);
          }
          if (existing.status === AuctionStatus.CANCELLED) {
            return tx.auction.findUniqueOrThrow({ where: { id }, include: this.auctionInclude() });
          }
          if (existing.winningBid?.walletReserved) {
            await this.wallet.releaseBid(
              tx,
              existing.winningBid.customerId,
              existing.winningBid.reservedAmount ?? existing.winningBid.amount,
              existing.winningBid.id,
            );
          }
          if (existing.winningBid) {
            await tx.bid.update({
              where: { id: existing.winningBid.id },
              data: { status: BidStatus.CANCELLED, walletReserved: false },
            });
          }
          return tx.auction.update({
            where: { id },
            data: { status: AuctionStatus.CANCELLED },
            include: this.auctionInclude(),
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          throw new AppException(
            'Auction changed concurrently; please retry',
            'AUCTION_CONFLICT_RETRY',
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      });
    await this.audit(adminId, 'auction.cancelled', id, {}, request);
    const response = this.toAuctionResponse(auction, { adminContext: true });
    this.sockets.emitToAdmins('auction_updated', response);
    this.sockets.emitToCustomers('auction_updated', response);
    return response;
  }

  async findAll(query: AuctionQueryDto, customerVisible = false, customerId?: string) {
    const pagination = getPagination(query);
    const where: Prisma.AuctionWhereInput = {
      status: customerVisible ? AuctionStatus.ACTIVE : query.status,
      categoryId: query.categoryId,
      rarity: normalizeAuctionRarity(query.rarity),
      OR: query.search
        ? [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const serverTime = new Date();
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auction.findMany({
        where,
        include: this.auctionInclude(customerId),
        orderBy: this.getAuctionOrderBy(query),
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.auction.count({ where }),
    ]);
    const result = toPaginatedResult(
      items.map((auction) =>
        this.toAuctionResponse(auction, {
          customerId,
          serverTime,
          includeDetails: false,
          adminContext: !customerVisible,
        }),
      ),
      total,
      pagination.page,
      pagination.limit,
    );
    return { serverTime: serverTime.toISOString(), ...result };
  }

  async findOne(id: string, customerVisible = false, customerId?: string) {
    const where: Prisma.AuctionWhereInput = { id };
    if (customerVisible) {
      where.OR = [
        { status: AuctionStatus.ACTIVE },
        ...(customerId
          ? [{ bids: { some: { customerId } } }, { winnerCustomerId: customerId }]
          : []),
      ];
    }
    const auction = await this.prisma.auction.findFirstOrThrow({
      where,
      include: this.auctionInclude(customerId),
    });
    return this.toAuctionResponse(auction, {
      customerId,
      includeDetails: true,
      adminContext: !customerVisible,
    });
  }

  async pendingWins(customerId: string) {
    const auctions = await this.prisma.auction.findMany({
      where: {
        status: AuctionStatus.ENDED,
        winnerCustomerId: customerId,
        OR: [
          { soldOrderItemId: null },
          { soldOrderItem: { is: { checkoutStatus: CheckoutStatus.AWAITING_SELECTION } } },
        ],
      },
      include: this.auctionInclude(customerId),
      orderBy: { endsAt: 'desc' },
    });
    return auctions.map((auction) =>
      this.toAuctionResponse(auction, { customerId, includeDetails: true }),
    );
  }

  async bids(id: string) {
    const bids = await this.prisma.bid.findMany({
      where: { auctionId: id },
      include: { customer: true },
      orderBy: { amount: 'desc' },
    });
    return bids.map((bid) => this.toBidResponse(bid, true));
  }

  async placeBid(
    auctionId: string,
    customerId: string,
    dto: PlaceBidDto,
    request: Request,
    idempotencyKey?: string,
  ) {
    const result = await this.prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
          const [customer, auction] = await Promise.all([
            tx.customer.findUnique({ where: { id: customerId } }),
            tx.auction.findUnique({ where: { id: auctionId }, include: { winningBid: true } }),
          ]);

          if (!auction) {
            throw new AppException(
              'Auction was not found',
              'AUCTION_NOT_FOUND',
              HttpStatus.NOT_FOUND,
            );
          }
          if (auction.status === AuctionStatus.CANCELLED) {
            throw new AppException(
              'Auction was cancelled',
              'AUCTION_CANCELLED',
              HttpStatus.CONFLICT,
            );
          }
          if (auction.status === AuctionStatus.ENDED) {
            throw new AppException('Auction has ended', 'AUCTION_ENDED', HttpStatus.CONFLICT);
          }
          if (auction.status !== AuctionStatus.ACTIVE) {
            throw new AppException(
              'Auction has not started',
              'AUCTION_NOT_STARTED',
              HttpStatus.CONFLICT,
            );
          }
          const now = new Date();
          if (now < auction.startsAt) {
            throw new AppException(
              'Auction has not started',
              'AUCTION_NOT_STARTED',
              HttpStatus.CONFLICT,
            );
          }
          if (now >= auction.endsAt) {
            throw new AppException('Auction has ended', 'AUCTION_ENDED', HttpStatus.CONFLICT);
          }
          if (!customer || customer.status === CustomerStatus.BLOCKED) {
            throw new AppException(
              'Customer is not allowed to bid',
              'CUSTOMER_NOT_ALLOWED_TO_BID',
              HttpStatus.FORBIDDEN,
            );
          }
          const amount = new Prisma.Decimal(dto.amount);
          if (
            amount.lessThan(new Prisma.Decimal(auction.currentPrice).plus(auction.minIncrement))
          ) {
            throw new AppException(
              'Bid is lower than minimum increment',
              'BID_TOO_LOW',
              HttpStatus.BAD_REQUEST,
            );
          }

          const previousWinningBid = auction.winningBid;
          if (previousWinningBid) {
            if (previousWinningBid.walletReserved) {
              await this.wallet.releaseBid(
                tx,
                previousWinningBid.customerId,
                previousWinningBid.reservedAmount ?? previousWinningBid.amount,
                previousWinningBid.id,
              );
            }
            await tx.bid.update({
              where: { id: previousWinningBid.id },
              data: { status: BidStatus.OUTBID, walletReserved: false },
            });
          }

          const reservedAmount = this.checkout.depositFor(amount);
          const bid = await tx.bid.create({
            data: {
              auctionId,
              customerId,
              amount,
              reservedAmount,
              status: BidStatus.WINNING,
              walletReserved: true,
              placedAt: now,
            },
          });
          await this.wallet.reserveBid(
            tx,
            customerId,
            reservedAmount,
            bid.id,
            idempotencyKey
              ? `bid-hold:${customerId}:${sha256(`${auctionId}:${idempotencyKey}`)}`
              : undefined,
          );

          const secondsLeft = Math.floor((auction.endsAt.getTime() - now.getTime()) / 1000);
          const shouldExtend =
            secondsLeft <= auction.extensionTriggerSeconds &&
            auction.extensionsCount < auction.maxExtensions;
          const nextEndsAt = shouldExtend
            ? new Date(
                Math.max(auction.endsAt.getTime(), now.getTime()) + auction.extensionSeconds * 1000,
              )
            : auction.endsAt;

          const updatedAuction = await tx.auction.update({
            where: { id: auctionId },
            data: {
              currentPrice: amount,
              winningBidId: bid.id,
              endsAt: nextEndsAt,
              extensionsCount: shouldExtend ? { increment: 1 } : undefined,
            },
          });

          return { bid, auction: updatedAuction, previousWinningBid, extended: shouldExtend };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          throw new AppException(
            'Bid changed concurrently; please retry',
            'BID_CONFLICT_RETRY',
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      });

    if (result.extended) {
      await this.scheduleClose(result.auction.id, result.auction.endsAt);
    }
    if (result.previousWinningBid?.customerId) {
      await this.notifications.createForCustomer({
        customerId: result.previousWinningBid.customerId,
        type: NotificationType.BID_OUTBID,
        title: 'You were outbid',
        body: result.auction.title,
        data: { auctionId, bidId: result.bid.id },
      });
    }
    await this.auditLogs.create({
      actorType: ActorType.CUSTOMER,
      actorId: customerId,
      action: 'auction.bid_placed',
      entityType: 'Bid',
      entityId: result.bid.id,
      metadata: { auctionId, amount: String(result.bid.amount), extended: result.extended },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    const auction = await this.prisma.auction.findUniqueOrThrow({
      where: { id: auctionId },
      include: this.auctionInclude(customerId),
    });
    const response = this.toPlaceBidResult(result.bid, auction, customerId);
    this.sockets.emitToAdmins('auction_updated', response.auction);
    this.sockets.emitToCustomers('auction_updated', response.auction);
    return response;
  }

  async closeAuction(auctionId: string, actorId?: string) {
    const closeResult = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
        const auction = await tx.auction.findUnique({
          where: { id: auctionId },
          include: { winningBid: true, bids: true },
        });
        if (!auction || auction.status !== AuctionStatus.ACTIVE) {
          return { auction, sale: null };
        }
        const now = new Date();
        if (now < auction.endsAt) {
          return { auction, sale: null, rescheduleAt: auction.endsAt };
        }

        if (!auction.winningBid) {
          const ended = await tx.auction.update({
            where: { id: auction.id },
            data: { status: AuctionStatus.ENDED },
          });
          return { auction: ended, sale: null };
        }

        await tx.bid.update({
          where: { id: auction.winningBid.id },
          data: { status: BidStatus.WON },
        });
        await tx.bid.updateMany({
          where: {
            auctionId,
            id: { not: auction.winningBid.id },
            status: { not: BidStatus.CANCELLED },
          },
          data: { status: BidStatus.LOST },
        });

        const ended = await tx.auction.update({
          where: { id: auction.id },
          data: {
            status: AuctionStatus.ENDED,
            winnerCustomerId: auction.winningBid.customerId,
          },
        });
        return { auction: ended, sale: null, bids: auction.bids };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (closeResult.rescheduleAt && closeResult.auction) {
      await this.scheduleClose(closeResult.auction.id, closeResult.rescheduleAt);
      return closeResult;
    }

    if (closeResult.bids && closeResult.auction?.winnerCustomerId) {
      const winnerCustomerId = closeResult.auction.winnerCustomerId;
      await this.notifications.createForCustomer({
        customerId: winnerCustomerId,
        type: NotificationType.AUCTION_WON,
        title: 'Auction won',
        body: closeResult.auction.title,
        data: { auctionId: closeResult.auction.id },
      });
      const losingCustomerIds = new Set(
        closeResult.bids
          .filter((bid) => bid.customerId !== winnerCustomerId)
          .map((bid) => bid.customerId),
      );
      await Promise.all(
        [...losingCustomerIds].map((customerId) =>
          this.notifications.createForCustomer({
            customerId,
            type: NotificationType.AUCTION_LOST,
            title: 'Auction ended',
            body: closeResult.auction.title,
            data: { auctionId: closeResult.auction.id },
          }),
        ),
      );
    }

    if (closeResult.auction) {
      const auction = await this.prisma.auction.findUnique({
        where: { id: closeResult.auction.id },
        include: this.auctionInclude(),
      });
      const payload = auction
        ? this.toAuctionResponse(auction, { adminContext: true })
        : closeResult.auction;
      this.sockets.emitToAdmins('auction_closed', payload);
      this.sockets.emitToCustomers('auction_closed', payload);
      await this.auditLogs.create({
        actorType: actorId ? ActorType.ADMIN : ActorType.SYSTEM,
        actorId,
        action: 'auction.closed',
        entityType: 'Auction',
        entityId: closeResult.auction.id,
        metadata: { winnerCustomerId: closeResult.auction.winnerCustomerId },
      });
    }
    return closeResult;
  }

  async checkoutWonAuction(
    auctionId: string,
    customerId: string,
    dto: CheckoutDto,
    request: Request,
  ) {
    const result = await this.prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
          const auction = await tx.auction.findUnique({
            where: { id: auctionId },
            include: { winningBid: true, soldOrderItem: true },
          });
          if (!auction || auction.winnerCustomerId !== customerId) {
            throw new AppException(
              'Auction win was not found',
              'AUCTION_WIN_NOT_FOUND',
              HttpStatus.NOT_FOUND,
            );
          }
          if (auction.status !== AuctionStatus.ENDED || !auction.winningBid?.walletReserved) {
            throw new AppException(
              'Auction checkout is not available',
              'AUCTION_CHECKOUT_UNAVAILABLE',
              HttpStatus.CONFLICT,
            );
          }
          if (
            auction.soldOrderItem &&
            auction.soldOrderItem.checkoutStatus !== CheckoutStatus.AWAITING_SELECTION
          ) {
            throw new AppException(
              'Auction checkout is not available',
              'AUCTION_CHECKOUT_UNAVAILABLE',
              HttpStatus.CONFLICT,
            );
          }

          const sale = auction.soldOrderItem
            ? null
            : await this.salesService.createSoldItemInTransaction(tx, {
                customerId,
                categoryId: auction.categoryId,
                auctionId: auction.id,
                source: SaleSource.APP_AUCTION,
                price: auction.currentPrice,
                title: auction.title,
                description: auction.description ?? undefined,
                imageUrl: auction.imageUrls[0],
                shouldCreatePrintJob: false,
                initialLabelStatus: LabelStatus.PENDING,
                dedicatedOrder: true,
              });
          const item = auction.soldOrderItem ?? sale!.items[0];
          if (sale) {
            await tx.auction.update({
              where: { id: auction.id },
              data: { soldOrderItemId: item.id },
            });
          }
          const checkout = await this.checkout.complete(tx, {
            customerId,
            orderId: item.orderId,
            itemIds: [item.id],
            totalAmount: new Prisma.Decimal(item.price),
            paymentMethod: dto.paymentMethod,
            delivery: dto.delivery,
            referenceId: item.id,
            eventKey: `auction-checkout:${auctionId}:${customerId}`,
            bidHold: {
              bidId: auction.winningBid.id,
              amount: auction.winningBid.reservedAmount ?? auction.winningBid.amount,
            },
          });
          await tx.bid.update({
            where: { id: auction.winningBid.id },
            data: { walletReserved: false },
          });
          return { auction, item, checkout, sale };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          throw new AppException(
            'Checkout changed concurrently; please retry',
            'CHECKOUT_CONFLICT_RETRY',
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      });

    if (result.sale) {
      await this.salesService.recordSoldItemSideEffects(
        {
          customerId,
          categoryId: result.auction.categoryId,
          auctionId: result.auction.id,
          source: SaleSource.APP_AUCTION,
          price: result.item.price,
          title: result.auction.title,
          description: result.auction.description ?? undefined,
          imageUrl: result.auction.imageUrls[0],
          shouldCreatePrintJob: false,
          initialLabelStatus: LabelStatus.PENDING,
          dedicatedOrder: true,
        },
        result.sale,
        { actorType: ActorType.CUSTOMER, actorId: customerId },
        'auction.checkout_sale_created',
      );
    }

    await this.auditLogs.create({
      actorType: ActorType.CUSTOMER,
      actorId: customerId,
      action: 'auction.checkout_confirmed',
      entityType: 'OrderItem',
      entityId: result.item.id,
      metadata: {
        auctionId,
        paymentMethod: dto.paymentMethod,
        walletPaidAmount: result.checkout.walletPaid.toFixed(2),
        cashDueAmount: result.checkout.cashDue.toFixed(2),
      },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    this.sockets.emitToAdmins('shipping_request_created', result.checkout.shipmentRequest);
    await this.notifications.createForCustomer({
      customerId,
      type: NotificationType.ORDER_UPDATED,
      title: 'Auction order confirmed',
      body: result.auction.title,
      data: { auctionId, orderItemId: result.item.id },
    });
    return {
      auctionId,
      orderId: result.item.orderId,
      orderItemId: result.item.id,
      shipmentRequestId: result.checkout.shipmentRequest.id,
      paymentMethod: dto.paymentMethod,
      totalAmount: new Prisma.Decimal(result.item.price).toFixed(2),
      walletPaidAmount: result.checkout.walletPaid.toFixed(2),
      cashDueAmount: result.checkout.cashDue.toFixed(2),
      status: 'AWAITING_FULFILLMENT',
    };
  }

  async closeNow(id: string, adminId: string) {
    await this.prisma.auction.update({ where: { id }, data: { endsAt: new Date() } });
    const result = await this.closeAuction(id, adminId);
    if (!result.auction) {
      return result;
    }
    const auction = await this.prisma.auction.findUnique({
      where: { id: result.auction.id },
      include: this.auctionInclude(),
    });
    return {
      ...result,
      auction: auction ? this.toAuctionResponse(auction, { adminContext: true }) : result.auction,
    };
  }

  async scheduleClose(auctionId: string, endsAt: Date) {
    const delay = Math.max(0, endsAt.getTime() - Date.now());
    await this.closeQueue.add(
      'close',
      { auctionId },
      { jobId: `auction-close-${auctionId}`, delay, removeOnComplete: true, removeOnFail: 100 },
    );
  }

  private getSettings() {
    return this.prisma.appSettings.upsert({
      where: { id: APP_SETTINGS_ID },
      create: { id: APP_SETTINGS_ID, storeName: 'شناشيل', currency: 'IQD', labelTemplate: {} },
      update: {},
    });
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

  private auctionInclude(customerId?: string) {
    return {
      category: true,
      winningBid: true,
      soldOrderItem: true,
      winnerCustomer: true,
      _count: { select: { bids: true } },
      bids: customerId
        ? {
            where: { customerId },
            orderBy: { amount: 'desc' as const },
            take: 1,
          }
        : false,
    } satisfies Prisma.AuctionInclude;
  }

  private getAuctionOrderBy(query: AuctionQueryDto): Prisma.AuctionOrderByWithRelationInput[] {
    if (query.sortBy) {
      return [{ [query.sortBy]: query.sortOrder ?? 'asc' }, { id: 'asc' }];
    }
    // Default public ordering is deterministic: VIP first, then live/upcoming
    // by start time, with id as the final pagination tie-breaker.
    return [{ tier: 'desc' }, { startsAt: 'asc' }, { endsAt: 'asc' }, { id: 'asc' }];
  }

  private toAuctionResponse(
    auction: Record<string, any>,
    options: {
      customerId?: string;
      serverTime?: Date;
      includeDetails?: boolean;
      adminContext?: boolean;
    } = {},
  ): AuctionResponseDto {
    const now = options.serverTime ?? new Date();
    const minimumNextBid = new Prisma.Decimal(auction.currentPrice).plus(auction.minIncrement);
    const isLive =
      auction.status === AuctionStatus.ACTIVE && auction.startsAt <= now && auction.endsAt > now;
    const isEnded =
      auction.status === AuctionStatus.ENDED ||
      auction.status === AuctionStatus.CANCELLED ||
      auction.endsAt <= now;
    const myBid = Array.isArray(auction.bids) ? auction.bids[0] : undefined;
    const isWinning = options.customerId
      ? auction.status !== AuctionStatus.CANCELLED &&
        auction.winningBid?.customerId === options.customerId
      : null;
    const response: AuctionResponseDto = {
      id: auction.id,
      title: auction.title,
      description: auction.description,
      categoryId: auction.categoryId,
      categoryName: auction.category?.name ?? null,
      imageUrls: auction.imageUrls ?? [],
      status: auction.status,
      tier: auction.tier ?? AuctionTier.NORMAL,
      rarity: options.adminContext ? legacyAdminAuctionRarity(auction.rarity) : auction.rarity,
      isVip: (auction.tier ?? AuctionTier.NORMAL) === AuctionTier.VIP,
      startingPrice: this.toMoney(auction.startingPrice),
      currentPrice: this.toMoney(auction.currentPrice),
      minIncrement: this.toMoney(auction.minIncrement),
      minimumNextBid: this.toMoney(minimumNextBid),
      startsAt: auction.startsAt,
      endsAt: auction.endsAt,
      serverTime: now.toISOString(),
      isLive,
      isEnded,
      totalBids: auction._count?.bids ?? auction.bids?.length ?? 0,
      bidDepositPercent: 10,
      winnerCustomerId: options.adminContext ? (auction.winnerCustomerId ?? null) : null,
    };

    if (options.includeDetails || options.adminContext) {
      response.extensionSeconds = auction.extensionSeconds;
      response.extensionTriggerSeconds = auction.extensionTriggerSeconds;
      response.maxExtensions = auction.maxExtensions;
      response.extensionCount = auction.extensionsCount;
      response.canBid = isLive;
      response.bidDisabledReason = this.bidDisabledReason(auction, now);
    }

    if (options.customerId) {
      response.myHighestBid = myBid ? this.toMoney(myBid.amount) : null;
      response.isWinning = isWinning;
      response.isOutbid = myBid && auction.status !== AuctionStatus.CANCELLED ? !isWinning : false;
      response.checkoutRequired = Boolean(
        auction.status === AuctionStatus.ENDED &&
        auction.winnerCustomerId === options.customerId &&
        (auction.soldOrderItemId === null ||
          auction.soldOrderItem?.checkoutStatus === CheckoutStatus.AWAITING_SELECTION),
      );
    }

    if (options.adminContext) {
      response.winnerCustomer = auction.winnerCustomer
        ? toSafeCustomer(auction.winnerCustomer)
        : null;
    }

    return response;
  }

  private toPlaceBidResult(
    bid: { id: string; auctionId: string; amount: Prisma.Decimal; createdAt: Date },
    auction: Record<string, any>,
    customerId: string,
  ): PlaceBidResultDto {
    const serverTime = new Date();
    return {
      auctionId: bid.auctionId,
      bidId: bid.id,
      amount: this.toMoney(bid.amount),
      currentPrice: this.toMoney(auction.currentPrice),
      minimumNextBid: this.toMoney(
        new Prisma.Decimal(auction.currentPrice).plus(auction.minIncrement),
      ),
      endsAt: auction.endsAt,
      serverTime: serverTime.toISOString(),
      isWinning: true,
      createdAt: bid.createdAt,
      auction: this.toAuctionResponse(auction, { customerId, serverTime, includeDetails: true }),
      bid: this.toBidResponse(bid),
    };
  }

  private toBidResponse(bid: Record<string, any>, includeCustomer = false): BidResponseDto {
    return {
      id: bid.id,
      auctionId: bid.auctionId,
      customerId: bid.customerId,
      amount: this.toMoney(bid.amount),
      status: bid.status,
      placedAt: bid.placedAt,
      createdAt: bid.createdAt,
      customer: includeCustomer && bid.customer ? toSafeCustomer(bid.customer) : undefined,
    };
  }

  private bidDisabledReason(auction: Record<string, any>, now: Date) {
    if (auction.status === AuctionStatus.CANCELLED) {
      return 'AUCTION_CANCELLED';
    }
    if (auction.status === AuctionStatus.ENDED || auction.endsAt <= now) {
      return 'AUCTION_ENDED';
    }
    if (auction.status !== AuctionStatus.ACTIVE || auction.startsAt > now) {
      return 'AUCTION_NOT_STARTED';
    }
    return null;
  }

  private toMoney(value: Prisma.Decimal | number | string) {
    return new Prisma.Decimal(value).toFixed(2);
  }

  private assertVipPermission(
    tier: AuctionTier,
    adminUser?: { role?: string; permissions?: string[] },
  ) {
    if (tier !== AuctionTier.VIP) return;
    if (
      adminUser?.role === 'OWNER' ||
      adminUser?.permissions?.includes(PERMISSIONS.AUCTIONS_SET_VIP)
    )
      return;
    throw new AppException(
      'You do not have permission to set an auction as VIP',
      'INSUFFICIENT_PERMISSIONS',
      HttpStatus.FORBIDDEN,
    );
  }

  private audit(adminId: string, action: string, id: string, metadata: unknown, request: Request) {
    return this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action,
      entityType: 'Auction',
      entityId: id,
      metadata: metadata as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
