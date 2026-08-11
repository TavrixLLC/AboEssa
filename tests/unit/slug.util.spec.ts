import { toSlug } from 'src/common/utils/slug.util';

describe('toSlug', () => {
  it('normalizes category names into URL-safe slugs', () => {
    expect(toSlug('  Home & Tools  ')).toBe('home-tools');
  });
});

