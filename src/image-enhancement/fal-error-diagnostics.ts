// Deliberate allowlists: provider messages, input echoes, URLs and arbitrary context
// are NEVER retained. Unknown codes are redacted, not accepted merely by regex.
const TYPES = new Set([
  'internal_server_error',
  'generation_timeout',
  'content_policy_violation',
  'image_too_large',
  'image_too_small',
  'image_load_error',
  'image_decode_error',
  'unsupported_image_format',
  'invalid_image',
  'invalid_image_url',
  'no_images_generated',
  'generation_failed',
  'invalid_request',
  'validation_error',
  'missing',
  'string_type',
  'string_too_short',
  'string_too_long',
  'int_type',
  'int_parsing',
  'float_type',
  'float_parsing',
  'bool_type',
  'bool_parsing',
  'list_type',
  'too_short',
  'too_long',
  'enum',
  'literal_error',
  'value_error',
  'greater_than',
  'greater_than_equal',
  'less_than',
  'less_than_equal',
  'extra_forbidden',
  'url_parsing',
  'url_scheme',
  'json_invalid',
]);
const FIELDS = new Set([
  'body',
  'query',
  'path',
  'prompt',
  'system_prompt',
  'image_urls',
  'num_images',
  'aspect_ratio',
  'output_format',
  'safety_tolerance',
  'sync_mode',
  'limit_generations',
  'thinking_level',
  'seed',
]);
const NUMERIC_CONTEXT = new Set([
  'min_width',
  'max_width',
  'min_height',
  'max_height',
  'actual_width',
  'actual_height',
  'min_length',
  'max_length',
  'min_items',
  'max_items',
  'max_size',
  'limit_value',
  'ge',
  'gt',
  'le',
  'lt',
]);
export type SafeFalErrorDetail = {
  type: string;
  location: (string | number)[];
  context: Record<string, number>;
};
export type SafeFalDiagnostics = {
  version: 1;
  provider: 'fal';
  requestTimestamp: string;
  latencyMs: number;
  httpStatus: number | null;
  requestId: string | null;
  billableUnits: string | null;
  providerSuggestedRetry: boolean | null;
  automaticRetry: false;
  bodyState: 'NOT_READ' | 'EMPTY' | 'JSON' | 'NON_JSON' | 'TOO_LARGE' | 'READ_FAILED';
  errors: SafeFalErrorDetail[];
};
export const safeFalRequestId = (v: unknown): string | null =>
  typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
    ? v.toLowerCase()
    : null;
export function sanitizeFalErrorDetails(value: unknown): SafeFalErrorDetail[] {
  if (!value || typeof value !== 'object') return [];
  const detail = (value as { detail?: unknown }).detail;
  if (!Array.isArray(detail)) return [];
  return detail
    .slice(0, 8)
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
    .map((v) => {
      const context: Record<string, number> = {};
      if (v.ctx && typeof v.ctx === 'object') {
        for (const [k, n] of Object.entries(v.ctx)) {
          if (
            NUMERIC_CONTEXT.has(k) &&
            typeof n === 'number' &&
            Number.isFinite(n) &&
            n >= 0 &&
            n <= 1e9
          )
            context[k] = n;
        }
      }
      return {
        type:
          typeof v.type === 'string' && TYPES.has(v.type) ? v.type : 'unclassified_provider_error',
        location: Array.isArray(v.loc)
          ? v.loc
              .slice(0, 8)
              .map((p) =>
                typeof p === 'number' && Number.isSafeInteger(p) && p >= 0 && p <= 100
                  ? p
                  : typeof p === 'string' && FIELDS.has(p)
                    ? p
                    : '[redacted]',
              )
          : [],
        context,
      };
    });
}
export function falDiagnosticHeaders(
  response: Response | undefined,
  started: number,
): SafeFalDiagnostics {
  const units = response?.headers.get('x-fal-billable-units'),
    retry = response?.headers.get('x-fal-needs-retry');
  return {
    version: 1,
    provider: 'fal',
    requestTimestamp: new Date(started).toISOString(),
    latencyMs: Math.max(0, Date.now() - started),
    httpStatus: response?.status ?? null,
    requestId: safeFalRequestId(response?.headers.get('x-fal-request-id')),
    billableUnits: units && /^\d{1,4}(\.\d{1,12})?$/.test(units) ? units : null,
    providerSuggestedRetry: retry === '1' ? true : retry === '0' ? false : null,
    automaticRetry: false,
    bodyState: 'NOT_READ',
    errors: [],
  };
}
export async function readFalErrorDiagnostics(
  response: Response,
  started: number,
): Promise<SafeFalDiagnostics> {
  const d = falDiagnosticHeaders(response, started);
  if (!response.body) return { ...d, bodyState: 'EMPTY' };
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      bytes += r.value.byteLength;
      if (bytes > 16384) {
        await reader.cancel();
        return { ...d, bodyState: 'TOO_LARGE', latencyMs: Date.now() - started };
      }
      chunks.push(r.value);
    }
    if (!bytes) return { ...d, bodyState: 'EMPTY' };
    try {
      return {
        ...d,
        bodyState: 'JSON',
        errors: sanitizeFalErrorDetails(JSON.parse(Buffer.concat(chunks).toString('utf8'))),
        latencyMs: Date.now() - started,
      };
    } catch {
      return { ...d, bodyState: 'NON_JSON', latencyMs: Date.now() - started };
    }
  } catch {
    return { ...d, bodyState: 'READ_FAILED', latencyMs: Date.now() - started };
  } finally {
    reader.releaseLock();
  }
}
