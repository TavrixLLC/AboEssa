import { ConfigService } from '@nestjs/config';
import { assertStudioApproved, StudioProfile } from './brand-studio.config';
import { ImageProviderError } from './enhancement.provider';
import sharp from 'sharp';

export type StudioUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  imageOutputTokens?: number;
  textOutputTokens?: number;
};
export type StudioEditResult = {
  bytes: Buffer;
  reported: boolean;
  requestId?: string;
  modelVersion?: string;
  usage?: StudioUsage;
  billing?: import('./fal-studio.provider').FalStudioBilling;
  latencyMs?: number;
  requestMetadata?: Record<string, string | number | string[]>;
};
export function studioRequest(png: Buffer, p: StudioProfile) {
  if (png.length > 6 * 1024 * 1024) throw new ImageProviderError('STUDIO_REFERENCE_TOO_LARGE');
  return {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              p.prompt +
              '\nStyle: ' +
              JSON.stringify({
                name: p.name,
                revision: p.revision,
                palette: p.backgroundPalette,
                accents: p.accentsEnabled ? p.accentPalette : [],
                lighting: p.lighting,
                composition: p.composition,
                forbidden: p.forbidden,
              }),
          },
          { inlineData: { mimeType: 'image/png', data: png.toString('base64') } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      maxOutputTokens: 4096,
      imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
    },
  };
}
export async function geminiStudioEdit(
  config: ConfigService,
  png: Buffer,
  p: StudioProfile,
): Promise<StudioEditResult> {
  const s = assertStudioApproved(config);
  if (s.provider !== 'gemini') throw new ImageProviderError('STUDIO_PROVIDER_INVALID');
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 30000);
  try {
    // Official REST, no SDK automatic retries, query-string key, tools, files or redirects.
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${s.model}:generateContent`,
      {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': config.get<string>('GEMINI_API_KEY')!,
        },
        body: JSON.stringify(studioRequest(png, p)),
      },
    );
    if (!r.ok || !r.body) {
      await r.body?.cancel();
      throw new ImageProviderError(
        r.status === 429 ? 'STUDIO_PROVIDER_RATE_LIMIT' : 'STUDIO_PROVIDER_FAILED',
        true,
      );
    }
    const reader = r.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 17 * 1024 * 1024) {
        await reader.cancel();
        throw new ImageProviderError('STUDIO_RESPONSE_TOO_LARGE', true);
      }
      chunks.push(value);
    }
    return await parseStudioResponse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch (e) {
    if (e instanceof ImageProviderError) throw e;
    throw new ImageProviderError('STUDIO_OUTCOME_UNKNOWN', true);
  } finally {
    clearTimeout(timer);
  }
}
// Exported pure contract parser; tests call it without enabling transport.
export async function parseStudioResponse(body: unknown): Promise<StudioEditResult> {
  const b = body as {
    candidates?: {
      finishReason?: string;
      content?: {
        parts?: {
          inlineData?: { mimeType?: string; data?: string };
          thought?: boolean;
          fileData?: unknown;
          functionCall?: unknown;
        }[];
      };
    }[];
    promptFeedback?: { blockReason?: string };
    responseId?: string;
    modelVersion?: string;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      candidatesTokensDetails?: { modality: string; tokenCount: number }[];
    };
  };
  if (
    b.promptFeedback?.blockReason ||
    b.candidates?.length !== 1 ||
    b.candidates[0].finishReason !== 'STOP'
  )
    throw new ImageProviderError('STUDIO_RESPONSE_BLOCKED_OR_INCOMPLETE', true);
  const parts = b.candidates[0].content?.parts ?? [];
  if (parts.length > 16 || parts.some((p) => p.fileData || p.functionCall))
    throw new ImageProviderError('STUDIO_INLINE_ONLY', true);
  const images = parts.filter((p) => p.inlineData && !p.thought);
  if (images.length !== 1) throw new ImageProviderError('STUDIO_ONE_IMAGE_REQUIRED', true);
  const { mimeType, data } = images[0].inlineData!;
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType ?? '') ||
    typeof data !== 'string' ||
    data.length > 16 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    throw new ImageProviderError('STUDIO_IMAGE_INVALID', true);
  const bytes = Buffer.from(data, 'base64');
  if (bytes.toString('base64') !== data || bytes.length > 12 * 1024 * 1024)
    throw new ImageProviderError('STUDIO_IMAGE_INVALID', true);
  const m = await sharp(bytes, { limitInputPixels: 1048576, failOn: 'warning' })
    .timeout({ seconds: 12 })
    .metadata();
  if (
    m.width !== 1024 ||
    m.height !== 1024 ||
    (m.pages ?? 1) !== 1 ||
    ({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>)[
      m.format ?? ''
    ] !== mimeType
  )
    throw new ImageProviderError('STUDIO_IMAGE_INVALID', true);
  // Decode fully before persisting. Metadata is removed by composition, never copied to final media.
  await sharp(bytes, { limitInputPixels: 1048576, failOn: 'warning' })
    .timeout({ seconds: 12 })
    .raw()
    .toBuffer();
  const u = b.usageMetadata,
    usage: StudioUsage = {};
  for (const key of ['promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount'] as const) {
    const n = u?.[key];
    if (Number.isSafeInteger(n) && n! >= 0 && n! <= 1000000) usage[key] = n;
  }
  for (const [modality, key] of [
    ['IMAGE', 'imageOutputTokens'],
    ['TEXT', 'textOutputTokens'],
  ] as const) {
    const n = u?.candidatesTokensDetails?.find((x) => x.modality === modality)?.tokenCount;
    if (Number.isSafeInteger(n) && n! >= 0 && n! <= 1000000) usage[key] = n;
  }
  return {
    bytes,
    reported: true,
    usage,
    ...(b.responseId && /^[A-Za-z0-9_.-]{1,100}$/.test(b.responseId)
      ? { requestId: b.responseId }
      : {}),
    ...(b.modelVersion && /^[A-Za-z0-9_.-]{1,100}$/.test(b.modelVersion)
      ? { modelVersion: b.modelVersion }
      : {}),
  };
}
