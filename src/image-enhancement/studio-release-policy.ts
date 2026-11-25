import { ConfigService } from '@nestjs/config';

/** Browser availability is not authorization for paid transfer or QA mocks. */
export function assertStudioDispatchReleasePolicy(c: ConfigService, provider: string) {
  if (c.get('NODE_ENV') === 'production') {
    if (provider === 'mock') throw Error('STUDIO_PRODUCTION_MOCK_FORBIDDEN');
    if (c.get('PRODUCT_STUDIO_DISPATCH_ENABLED') !== 'true')
      throw Error('STUDIO_PAID_DISPATCH_DISABLED');
  } else if (c.get('PRODUCT_STUDIO_DISPATCH_ENABLED') === 'false') {
    throw Error('STUDIO_PAID_DISPATCH_DISABLED');
  }
}
