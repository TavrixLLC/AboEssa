import { Prisma } from '@prisma/client';
import { InventoryLedger, inventoryHash, inventoryRetryable } from 'src/inventory/inventory-ledger';

describe('Inventory transaction helper contracts', () => {
  it('canonicalizes nested object keys and undefined values, not array order', () => {
    expect(inventoryHash({ b: 2, a: { y: 1, x: 0 }, ignored: undefined })).toBe(
      inventoryHash({ a: { x: 0, y: 1 }, b: 2 }),
    );
    expect(inventoryHash([1, 2])).not.toBe(inventoryHash([2, 1]));
  });
  it('payment and delivery changes are part of the purchase identity', () => {
    const body = { productId: 'p', quantity: 1, paymentMethod: 'WALLET', delivery: { city: 'A' } };
    expect(inventoryHash(body)).not.toBe(
      inventoryHash({ ...body, paymentMethod: 'CASH_ON_DELIVERY' }),
    );
    expect(inventoryHash(body)).not.toBe(inventoryHash({ ...body, delivery: { city: 'B' } }));
  });
  it.each(['P2034', '40001', '40P01'])(
    'only aborted concurrency errors are retryable: %s',
    (code) => {
      const error = new Prisma.PrismaClientKnownRequestError('test', {
        code: code === 'P2034' ? code : 'P2010',
        clientVersion: '6.19.3',
        meta: { code },
      });
      expect(inventoryRetryable(error)).toBe(true);
      expect(inventoryRetryable(new Error('network or post-commit error'))).toBe(false);
    },
  );
  it('rejects missing or oversized keys before querying the database', async () => {
    const tx = { $queryRaw: jest.fn() } as any;
    await expect(InventoryLedger.operation(tx, 's', '', 'STOCK_IN', {}, 'ADMIN')).rejects.toThrow();
    await expect(
      InventoryLedger.operation(tx, 's', 'k'.repeat(161), 'STOCK_IN', {}, 'ADMIN'),
    ).rejects.toThrow();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('replays a committed operation but rejects a different payload', async () => {
    const prior = {
      id: 'operation',
      requestHash: inventoryHash({ kind: 'STOCK_IN', body: { quantity: 10 } }),
    };
    const tx = {
      $queryRaw: jest.fn(),
      inventoryOperation: { findUnique: jest.fn().mockResolvedValue(prior), create: jest.fn() },
    } as any;
    expect(
      (await InventoryLedger.operation(tx, 's', 'k', 'STOCK_IN', { quantity: 10 }, 'ADMIN'))
        .replayed,
    ).toBe(true);
    await expect(
      InventoryLedger.operation(tx, 's', 'k', 'STOCK_IN', { quantity: 11 }, 'ADMIN'),
    ).rejects.toThrow();
    expect(tx.inventoryOperation.create).not.toHaveBeenCalled();
  });
});
