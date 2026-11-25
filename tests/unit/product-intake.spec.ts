import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IntakePatchDto, IntakeCreateDto } from 'src/product-intake/product-intake.dto';
import { MediaController } from 'src/files/media.controller';
import { ConfigService } from '@nestjs/config';
import { ProductIntakeService } from 'src/product-intake/product-intake.service';
import { publishedIntakeMedia } from 'src/files/intake-media-visibility';
import { IntakeEnabledGuard } from 'src/product-intake/product-intake.controller';

describe('private rapid product intake contracts', () => {
  it('rejects a refreshed request if its persisted draft belongs to another signed-in actor', () => {
    const assertEnabled = jest.fn(),
      setHeader = jest.fn();
    const request = { headers: { 'x-intake-actor': 'employee-a' }, user: { id: 'employee-b' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader }) }),
    };
    const guard = new IntakeEnabledGuard({ assertEnabled } as any);
    expect(() => guard.canActivate(context as any)).toThrow();
    expect(assertEnabled).not.toHaveBeenCalled();
    request.user.id = 'employee-a';
    expect(guard.canActivate(context as any)).toBe(true);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('draft fields may be incomplete but unknown recognition output is not approved input', async () => {
    expect(
      await validate(plainToInstance(IntakePatchDto, { expectedRevision: 0 }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toEqual([]);
    expect(
      (
        await validate(
          plainToInstance(IntakePatchDto, {
            expectedRevision: 0,
            recognizedMetadata: { title: 'AI' },
          }),
          { whitelist: true, forbidNonWhitelisted: true },
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([0, -1, 1.5, 1000001])('rejects invalid incoming quantity %s', async (quantity) => {
    expect(
      (await validate(plainToInstance(IntakePatchDto, { expectedRevision: 0, quantity }))).length,
    ).toBeGreaterThan(0);
  });
  it('requires stable persisted client identity and operation key', async () => {
    expect(
      (
        await validate(
          plainToInstance(IntakeCreateDto, { clientDraftId: 'a', submissionOperationKey: '' }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('private media without its approved product is never public', async () => {
    const db = { productListing: { findFirst: jest.fn() } };
    expect(
      await publishedIntakeMedia(db as any, 'products/intake-asset.jpg', null, new ConfigService()),
    ).toBe(false);
    expect(db.productListing.findFirst).not.toHaveBeenCalled();
  });
  it('guessing an uncommitted private object key never reads storage', async () => {
    const storage = { getObject: jest.fn() },
      db = { fileAsset: { findUnique: jest.fn().mockResolvedValue(null) } },
      response = { setHeader: jest.fn() };
    const controller = new MediaController(storage as any, db as any, new ConfigService());
    await expect(
      controller.getMedia('products', 'intake-asset.jpg', response as any),
    ).rejects.toThrow();
    expect(storage.getObject).not.toHaveBeenCalled();
  });
  it('feature disable is separate from mapped commerce enforcement', () => {
    const inv = { assertEnabled: jest.fn() },
      config = new ConfigService({ intake: { enabled: false } });
    const service = new ProductIntakeService(
      {} as any,
      config,
      inv as any,
      {} as any,
      {} as any,
      {} as any,
      { assertNewAllowed: jest.fn() } as any,
    );
    expect(() => service.assertEnabled()).toThrow();
    expect(inv.assertEnabled).not.toHaveBeenCalled();
    config.set('intake.enabled', true);
    service.assertEnabled();
    expect(inv.assertEnabled).toHaveBeenCalledTimes(1);
  });
});
