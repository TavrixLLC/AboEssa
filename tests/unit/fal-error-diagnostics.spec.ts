import {
  readFalErrorDiagnostics,
  sanitizeFalErrorDetails,
  safeFalRequestId,
} from 'src/image-enhancement/fal-error-diagnostics';
describe('fal error diagnostics retain bounded safe metadata only', () => {
  it('only accepts UUID request IDs, not credential-like strings or URLs', () => {
    expect(safeFalRequestId('12345678-1234-1234-1234-123456789ABC')).toBe(
      '12345678-1234-1234-1234-123456789abc',
    );
    for (const value of [
      'fal_sk_fake:secret',
      'https://untrusted.invalid/key',
      'sk-not-a-request-id',
      null,
    ])
      expect(safeFalRequestId(value)).toBeNull();
  });
  it('redacts unknown type, arbitrary path segments, raw message, input, URL and string context', () => {
    const data = sanitizeFalErrorDetails({
      detail: [
        {
          type: 'fake-secret',
          loc: ['body', 'fake-secret', 10000],
          msg: 'fake-secret',
          input: 'fake-secret',
          url: 'fake-secret',
          ctx: { max_width: 2048, max_height: -1, max_length: Infinity, token: 'fake-secret' },
        },
      ],
    });
    expect(data).toEqual([
      {
        type: 'unclassified_provider_error',
        location: ['body', '[redacted]', '[redacted]'],
        context: { max_width: 2048 },
      },
    ]);
    expect(JSON.stringify(data)).not.toContain('fake-secret');
  });
  it('bounds detail count, path depth and numeric context', () => {
    const data = sanitizeFalErrorDetails({
      detail: Array.from({ length: 100 }, () => ({
        type: 'string_too_short',
        loc: Array(100).fill('prompt'),
        ctx: { max_width: 1e20 },
      })),
    });
    expect(data).toHaveLength(8);
    expect(data[0].location).toHaveLength(8);
    expect(data[0].context).toEqual({});
  });
  it.each([null, 'arbitrary raw text', { detail: 'fake-secret' }, { detail: [null] }])(
    'does not reflect non-structured errors',
    (input) => {
      expect(sanitizeFalErrorDetails(input)).toEqual([]);
    },
  );
  it('limits error bodies to 16 KiB and does not persist a truncated raw body', async () => {
    const d = await readFalErrorDiagnostics(
      new Response('x'.repeat(20000), { status: 422 }),
      Date.now(),
    );
    expect(d.bodyState).toBe('TOO_LARGE');
    expect(d.errors).toEqual([]);
    expect(JSON.stringify(d)).not.toContain('xxxx');
  });
  it('handles non-JSON/empty failures without changing unknown billing or retry policy', async () => {
    const d = await readFalErrorDiagnostics(
      new Response('<html>private</html>', { status: 502 }),
      Date.now(),
    );
    expect(d.bodyState).toBe('NON_JSON');
    expect(d.billableUnits).toBeNull();
    expect(d.automaticRetry).toBe(false);
    expect(JSON.stringify(d)).not.toContain('private');
    expect(
      (await readFalErrorDiagnostics(new Response(null, { status: 422 }), Date.now())).bodyState,
    ).toBe('EMPTY');
  });
  it('stream read failures remain safely classified', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(Error('fake-sensitive'));
      },
    });
    const d = await readFalErrorDiagnostics(new Response(stream, { status: 422 }), Date.now());
    expect(d.bodyState).toBe('READ_FAILED');
    expect(JSON.stringify(d)).not.toContain('fake-sensitive');
  });
});
