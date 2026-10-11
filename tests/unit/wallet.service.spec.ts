import { Prisma, WalletEntryType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PlaceBidDto } from 'src/auctions/dto/place-bid.dto';
import { WalletService } from 'src/wallet/wallet.service';

describe('Customer wallet', () => {
  const decimal = (value: string) => new Prisma.Decimal(value);

  it('rejects bid amounts that cannot be represented at wallet precision', () => {
    expect(validateSync(plainToInstance(PlaceBidDto, { amount: 1000.001 }))).not.toHaveLength(0);
    expect(validateSync(plainToInstance(PlaceBidDto, { amount: 1000.01 }))).toHaveLength(0);
  });

  it('shows zero without creating or funding a wallet', async () => {
    const prisma = {
      customerWallet: { findUnique: jest.fn().mockResolvedValue(null) },
      walletEntry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((callback) => callback(prisma)),
    };
    const wallet = await new WalletService(prisma as any).getForCustomer('customer-1');
    expect(wallet).toEqual({
      currency: 'IQD',
      availableBalance: '0.00',
      reservedBalance: '0.00',
      transactions: [],
      fundingAvailable: false,
    });
    expect(prisma.customerWallet.findUnique).toHaveBeenCalledWith({
      where: { customerId: 'customer-1' },
    });
  });

  it('atomically spends, reserves, releases and settles without creating money', async () => {
    let available = decimal('10000.00');
    let reserved = decimal('0.00');
    const entries: Array<{ type: WalletEntryType; amount: Prisma.Decimal; eventKey: string }> = [];
    const tx = {
      customerWallet: {
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          if (where.customerId !== 'customer-1') return { count: 0 };
          if (where.availableBalance && available.lessThan(where.availableBalance.gte))
            return { count: 0 };
          if (where.reservedBalance && reserved.lessThan(where.reservedBalance.gte))
            return { count: 0 };
          if (data.availableBalance?.decrement)
            available = available.minus(data.availableBalance.decrement);
          if (data.availableBalance?.increment)
            available = available.plus(data.availableBalance.increment);
          if (data.reservedBalance?.decrement)
            reserved = reserved.minus(data.reservedBalance.decrement);
          if (data.reservedBalance?.increment)
            reserved = reserved.plus(data.reservedBalance.increment);
          return { count: 1 };
        }),
        findUniqueOrThrow: jest
          .fn()
          .mockImplementation(() => ({ availableBalance: available, reservedBalance: reserved })),
      },
      walletEntry: {
        create: jest.fn().mockImplementation(({ data }) => {
          entries.push(data);
          return data;
        }),
      },
    };
    const service = new WalletService({} as any);
    await service.debitPurchase(tx as any, 'customer-1', decimal('2000'), 'item-1', 'buy-1');
    await service.reserveBid(tx as any, 'customer-1', decimal('5000'), 'bid-1');
    expect([available.toFixed(2), reserved.toFixed(2)]).toEqual(['3000.00', '5000.00']);
    await expect(
      service.reserveBid(tx as any, 'customer-1', decimal('4000'), 'bid-2'),
    ).rejects.toMatchObject({ code: 'WALLET_INSUFFICIENT_FUNDS' });
    expect(entries).toHaveLength(2);
    await service.releaseBid(tx as any, 'customer-1', decimal('5000'), 'bid-1');
    await service.reserveBid(tx as any, 'customer-1', decimal('6000'), 'bid-3');
    await service.settleBid(tx as any, 'customer-1', decimal('6000'), 'bid-3');
    expect([available.toFixed(2), reserved.toFixed(2)]).toEqual(['2000.00', '0.00']);
    expect(entries.map((entry) => entry.type)).toEqual([
      WalletEntryType.PURCHASE,
      WalletEntryType.BID_HOLD,
      WalletEntryType.BID_RELEASE,
      WalletEntryType.BID_HOLD,
      WalletEntryType.BID_SETTLEMENT,
    ]);
  });
});
