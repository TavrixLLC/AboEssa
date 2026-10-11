import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, WalletEntryType } from '@prisma/client';
import { AppException } from 'src/common/exceptions/app.exception';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getForCustomer(customerId: string) {
    const [wallet, entries] = await this.prisma.$transaction(
      async (tx) =>
        Promise.all([
          tx.customerWallet.findUnique({ where: { customerId } }),
          tx.walletEntry.findMany({
            where: { walletCustomerId: customerId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 30,
            select: {
              id: true,
              type: true,
              amount: true,
              availableAfter: true,
              reservedAfter: true,
              referenceId: true,
              createdAt: true,
            },
          }),
        ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      currency: 'IQD',
      availableBalance: wallet?.availableBalance.toFixed(2) ?? '0.00',
      reservedBalance: wallet?.reservedBalance.toFixed(2) ?? '0.00',
      transactions: entries.map((entry) => ({
        ...entry,
        amount: entry.amount.toFixed(2),
        availableAfter: entry.availableAfter.toFixed(2),
        reservedAfter: entry.reservedAfter.toFixed(2),
      })),
      fundingAvailable: false,
    };
  }

  async debitPurchase(
    tx: Prisma.TransactionClient,
    customerId: string,
    amount: Prisma.Decimal,
    orderItemId: string,
    eventKey: string,
  ) {
    await this.move(tx, customerId, amount, WalletEntryType.PURCHASE, orderItemId, eventKey);
  }

  async debitCodDeposit(
    tx: Prisma.TransactionClient,
    customerId: string,
    amount: Prisma.Decimal,
    orderItemId: string,
    eventKey: string,
  ) {
    await this.move(tx, customerId, amount, WalletEntryType.COD_DEPOSIT, orderItemId, eventKey);
  }

  async reserveBid(
    tx: Prisma.TransactionClient,
    customerId: string,
    amount: Prisma.Decimal,
    bidId: string,
    eventKey = `bid-hold:${bidId}`,
  ) {
    await this.move(tx, customerId, amount, WalletEntryType.BID_HOLD, bidId, eventKey);
  }

  async releaseBid(
    tx: Prisma.TransactionClient,
    customerId: string,
    amount: Prisma.Decimal,
    bidId: string,
  ) {
    await this.move(
      tx,
      customerId,
      amount,
      WalletEntryType.BID_RELEASE,
      bidId,
      `bid-release:${bidId}`,
    );
  }

  async settleBid(
    tx: Prisma.TransactionClient,
    customerId: string,
    amount: Prisma.Decimal,
    bidId: string,
  ) {
    await this.move(
      tx,
      customerId,
      amount,
      WalletEntryType.BID_SETTLEMENT,
      bidId,
      `bid-settle:${bidId}`,
    );
  }

  private async move(
    tx: Prisma.TransactionClient,
    customerId: string,
    amount: Prisma.Decimal,
    type: WalletEntryType,
    referenceId: string,
    eventKey: string,
  ) {
    if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      throw new AppException(
        'Invalid wallet amount',
        'WALLET_INVALID_AMOUNT',
        HttpStatus.BAD_REQUEST,
      );
    }
    const spendsAvailable =
      type === WalletEntryType.PURCHASE ||
      type === WalletEntryType.COD_DEPOSIT ||
      type === WalletEntryType.BID_HOLD;
    const updated = await tx.customerWallet.updateMany({
      where: {
        customerId,
        ...(spendsAvailable
          ? { availableBalance: { gte: amount } }
          : { reservedBalance: { gte: amount } }),
      },
      data: {
        availableBalance:
          type === WalletEntryType.PURCHASE ||
          type === WalletEntryType.COD_DEPOSIT ||
          type === WalletEntryType.BID_HOLD
            ? { decrement: amount }
            : type === WalletEntryType.BID_RELEASE
              ? { increment: amount }
              : undefined,
        reservedBalance:
          type === WalletEntryType.BID_HOLD
            ? { increment: amount }
            : type === WalletEntryType.BID_RELEASE || type === WalletEntryType.BID_SETTLEMENT
              ? { decrement: amount }
              : undefined,
      },
    });
    if (updated.count !== 1) {
      throw new AppException(
        spendsAvailable ? 'Insufficient wallet balance' : 'Bid funds are not reserved',
        spendsAvailable ? 'WALLET_INSUFFICIENT_FUNDS' : 'WALLET_HOLD_NOT_FOUND',
        HttpStatus.CONFLICT,
      );
    }
    const wallet = await tx.customerWallet.findUniqueOrThrow({ where: { customerId } });
    try {
      await tx.walletEntry.create({
        data: {
          walletCustomerId: customerId,
          type,
          amount,
          availableAfter: wallet.availableBalance,
          reservedAfter: wallet.reservedBalance,
          referenceId,
          eventKey,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          'Wallet request was already processed',
          'WALLET_DUPLICATE_REQUEST',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }
}
