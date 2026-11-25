import { CatalogService, normalizedCatalogText } from 'src/catalog/catalog.service';

describe('catalog cursor and normalization', () => {
  it('normalizes Arabic labels without damaging model digits or Latin text', () => {
    expect(normalizedCatalogText('  إلكَتروني ـ 400ML  ')).toBe('الكتروني 400ml');
  });
  it('rejects cursors from another search or category before reading SQL', async () => {
    const db = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const service = new CatalogService(db as any);
    await expect(
      service.list('products', {
        limit: 20,
        cursor: Buffer.from(JSON.stringify({ v: 1, query: 'wrong' })).toString('base64url'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CATALOG_CURSOR' });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
