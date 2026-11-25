const proxyaddr: {
  compile(subnet: string): (address: string, hop: number) => boolean;
} = require('proxy-addr');

describe('pre-production dependency security regressions', () => {
  it('does not turn a short IPv4-mapped IPv6 subnet into trust-all', () => {
    const trust = proxyaddr.compile('::ffff:10.0.0.0/8');
    expect(trust('203.0.113.9', 0)).toBe(false);
    expect(trust('127.0.0.1', 0)).toBe(false);
  });

  it('preserves correctly spelled IPv4 and mapped-IPv6 proxy subnet behavior', () => {
    expect(proxyaddr.compile('10.0.0.0/8')('10.1.2.3', 0)).toBe(true);
    expect(proxyaddr.compile('::ffff:10.0.0.0/104')('10.1.2.3', 0)).toBe(true);
    expect(proxyaddr.compile('::ffff:10.0.0.0/104')('203.0.113.9', 0)).toBe(false);
  });

  it('retains the Prisma configuration merge API after the scoped security override', () => {
    const { deepmerge } = require('deepmerge-ts');
    expect(deepmerge({ database: { host: 'qa' } }, { database: { port: 55442 } })).toEqual({
      database: { host: 'qa', port: 55442 },
    });
  });
});
