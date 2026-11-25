import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { CategorySnapshot, recognitionPrompt, responseSchema } from './recognition.schema';
import { aiSettings, assertGeminiApproved } from './ai.config';

export type ProviderInput = { jpeg: Buffer; sourceHash: string; categories: CategorySnapshot };
export type ProviderOutput = {
  value: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
};
export class RecognitionProviderError extends Error {
  constructor(
    readonly code: string,
    readonly possiblyBilled = false,
  ) {
    super(code);
  }
}
type GeminiResponse = {
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: {
      parts?: {
        text?: string;
        thought?: boolean;
        functionCall?: unknown;
        executableCode?: unknown;
      }[];
    };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
};
const tokenSchema = Joi.number().integer().min(0).max(2097152);
const envelope = Joi.object({
  modelVersion: Joi.string().max(100),
  promptFeedback: Joi.object({ blockReason: Joi.string().max(100) }).unknown(true),
  candidates: Joi.array()
    .max(1)
    .items(
      Joi.object({
        finishReason: Joi.string().max(100),
        content: Joi.object({
          parts: Joi.array()
            .max(10)
            .items(
              Joi.object({
                text: Joi.string().allow('').max(32000),
                thought: Joi.boolean(),
                functionCall: Joi.any(),
                executableCode: Joi.any(),
              }).unknown(true),
            ),
        }).unknown(true),
      }).unknown(true),
    ),
  usageMetadata: Joi.object({
    promptTokenCount: tokenSchema,
    candidatesTokenCount: tokenSchema,
    thoughtsTokenCount: tokenSchema,
  }).unknown(true),
}).unknown(true);
@Injectable()
export class MockRecognitionProvider {
  readonly fixtures = new Map<string, unknown>();
  defaultFixture?: unknown; // In-memory test harness only; never writable by HTTP.
  calls = 0;
  async recognize(input: ProviderInput): Promise<ProviderOutput> {
    await Promise.resolve();
    this.calls++;
    return {
      value: this.fixtures.get(input.sourceHash) ??
        this.defaultFixture ?? {
          name_ar: null,
          name_en: null,
          description_ar: null,
          brand: null,
          product_type: null,
          category_id: null,
          size_value: null,
          size_unit: null,
          color: null,
          model_number: null,
          manufacturer: null,
          barcode_text: null,
          visible_attributes: [],
          uncertain_fields: ['name_ar', 'category_id'],
          needs_review: true,
        },
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
    };
  }
}
@Injectable()
export class GeminiRecognitionProvider {
  constructor(private readonly config: ConfigService) {}
  async recognize(input: ProviderInput): Promise<ProviderOutput> {
    assertGeminiApproved(this.config);
    const settings = aiSettings(this.config),
      abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), settings.timeoutMs);
    try {
      // Fixed origin, validated model, no redirects, files API, tools or remote URL fetches.
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent`,
        {
          method: 'POST',
          redirect: 'error',
          signal: abort.signal,
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': this.config.get<string>('GEMINI_API_KEY')!,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: recognitionPrompt(input.categories) }] },
            contents: [
              {
                role: 'user',
                parts: [
                  { inlineData: { mimeType: 'image/jpeg', data: input.jpeg.toString('base64') } },
                ],
              },
            ],
            generationConfig: {
              candidateCount: 1,
              maxOutputTokens: settings.maxOutputTokens,
              responseMimeType: 'application/json',
              responseJsonSchema: responseSchema(input.categories),
            },
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        const code =
          response.status === 429
            ? 'AI_RATE_LIMITED'
            : response.status === 401 || response.status === 403
              ? 'AI_PROVIDER_AUTH'
              : response.status === 400
                ? 'AI_PROVIDER_REQUEST'
                : 'AI_PROVIDER_UNAVAILABLE';
        throw new RecognitionProviderError(code, true);
      }
      if (!response.body) throw new RecognitionProviderError('AI_EMPTY_RESPONSE', true);
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          throw new RecognitionProviderError('AI_RESPONSE_TOO_LARGE', true);
        }
        chunks.push(value);
      }
      const rawBody: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const checked = envelope.validate(rawBody, { convert: false });
      if (checked.error) throw new RecognitionProviderError('AI_INVALID_RESPONSE', true);
      const body = checked.value as GeminiResponse;
      const candidate = body.candidates?.[0];
      if (body.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY')
        throw new RecognitionProviderError('AI_SAFETY_BLOCKED', true);
      if (body.modelVersion !== settings.modelRevision)
        throw new RecognitionProviderError('AI_MODEL_REVISION_CHANGED', true);
      if (body.candidates?.length !== 1 || candidate?.finishReason !== 'STOP')
        throw new RecognitionProviderError('AI_INCOMPLETE_RESPONSE', true);
      const parts = candidate.content?.parts;
      if (!Array.isArray(parts) || parts.some((p) => p.functionCall || p.executableCode))
        throw new RecognitionProviderError('AI_INVALID_RESPONSE', true);
      const raw = parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('');
      const token = (v: unknown) =>
        Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 2097152 ? Number(v) : null;
      return {
        value: JSON.parse(raw),
        inputTokens: token(body.usageMetadata?.promptTokenCount),
        outputTokens: token(body.usageMetadata?.candidatesTokenCount),
        thinkingTokens: token(body.usageMetadata?.thoughtsTokenCount),
      };
    } catch (e) {
      if (e instanceof RecognitionProviderError) throw e;
      // Transport timeout/disconnect/invalid response is NOT proof that the provider didn't bill.
      throw new RecognitionProviderError(
        abort.signal.aborted ? 'AI_TIMEOUT' : 'AI_PROVIDER_RESPONSE',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
