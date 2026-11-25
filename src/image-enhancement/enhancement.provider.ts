import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { assertEditingApproved, EDIT_PROMPT, enhancementSettings } from './enhancement.config';
export type EditResult = { bytes: Buffer; requestId?: string; reported: boolean };
export class ImageProviderError extends Error {
  constructor(
    readonly code: string,
    readonly possiblyBilled = false,
    readonly diagnostics?: import('./fal-error-diagnostics').SafeFalDiagnostics,
  ) {
    super(code);
  }
}
export function inlineImage(value: unknown): Buffer {
  if (
    typeof value !== 'string' ||
    value.length > 16 * 1024 * 1024 ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw new ImageProviderError('IMAGE_INLINE_RESULT_REQUIRED', true);
  const b64 = value.slice(value.indexOf(',') + 1),
    bytes = Buffer.from(b64, 'base64');
  if (bytes.length > 12 * 1024 * 1024 || bytes.toString('base64') !== b64)
    throw new ImageProviderError('IMAGE_PROVIDER_RESPONSE_INVALID', true);
  return bytes;
}
@Injectable()
export class ImageEditingProvider {
  calls = 0;
  readonly fixtures = new Map<string, Buffer | Error>(); // In-memory isolated tests only, not remotely configurable.
  constructor(private readonly config: ConfigService) {}
  async productStudio(
    png: Buffer,
    hash: string,
    maskHash: string,
    selection: import('./studio-templates').StudioSelection,
    geometry?: import('./tabletop-placement').TabletopGeometry,
    referenceKind?: string,
  ): Promise<import('./gemini-studio.provider').StudioEditResult> {
    const { assertStudioLibraryApproved } = await import('./studio-library.config'),
      s = assertStudioLibraryApproved(this.config, selection);
    this.calls++;
    if (s.provider === 'fal')
      return (await import('./fal-studio.provider')).falLibraryStudioEdit(
        this.config,
        png,
        hash,
        maskHash,
        selection,
        geometry,
        referenceKind,
      );
    const fixture = this.fixtures.get(
      `${hash}:${selection.templateId}:${selection.templateVersion}:${selection.processingMode}`,
    );
    if (fixture instanceof Error) throw fixture;
    if (fixture) return { bytes: fixture, reported: true };
    const { renderStudioPlate } = await import('./studio-scenes');
    if (selection.processingMode === 'FAITHFUL_COMPOSITE') {
      if (!geometry) throw Error('TABLETOP_GEOMETRY_REQUIRED');
      return {
        bytes: await renderStudioPlate(s.template, {
          ...geometry,
          canvasEdge: 1024,
          table: {
            ...geometry.table,
            y: Math.round((geometry.table.y * 1024) / geometry.canvasEdge),
          },
        }),
        reported: true,
      };
    }
    const { planTabletopPlacement } = await import('./tabletop-placement');
    const g = planTabletopPlacement(
      { left: 0, top: 0, width: 300, height: 450 },
      { camera: 'UPRIGHT', quarterTurns: 0, horizontal: 0.5 },
      { left: 0, right: 299 },
      false,
    );
    // Workflow-only surrogate: deliberately labeled MOCK, not fake fal quality.
    const object = Buffer.from(
      '<svg width="1024" height="1024"><rect x="362" y="410" width="300" height="450" rx="8" fill="#77797B" stroke="#B5B6B8" stroke-width="2"/><text x="390" y="640" font-size="50" font-family="Arial" fill="white">MOCK</text><text x="380" y="690" font-size="21" font-family="Arial" fill="white">WORKFLOW ONLY</text></svg>',
    );
    return {
      bytes: await sharp(await renderStudioPlate(s.template, g))
        .composite([{ input: object }])
        .png()
        .toBuffer(),
      reported: true,
      modelVersion: 'MOCK_WORKFLOW_ONLY',
    };
  }
  async studio(
    png: Buffer,
    hash: string,
    preset?: string,
    geometry?: import('./tabletop-placement').TabletopGeometry,
  ): Promise<import('./gemini-studio.provider').StudioEditResult> {
    const { assertStudioApproved } = await import('./brand-studio.config');
    const s = assertStudioApproved(this.config, preset);
    this.calls++;
    if (s.provider === 'mock') {
      const fixture = this.fixtures.get(preset ? `${hash}:${preset}` : hash);
      if (fixture instanceof Error) throw fixture;
      if (!fixture && s.profile.renderPolicy === 'GENERATIVE_PRODUCT_3D')
        throw Error('PREMIUM_3D_MOCK_RESULT_REQUIRED');
      if (!fixture && s.profile.placementRecipe) {
        if (!geometry) throw Error('TABLETOP_GEOMETRY_REQUIRED');
        const { renderLocalTabletop } = await import('./tabletop-scenes');
        return {
          bytes: await renderLocalTabletop(s.profile.name, {
            ...geometry,
            canvasEdge: 1024,
            table: {
              ...geometry.table,
              y: Math.round((geometry.table.y * 1024) / geometry.canvasEdge),
            },
          }),
          reported: true,
        };
      }
      return {
        bytes:
          fixture ??
          (await sharp({
            create: {
              width: 1024,
              height: 1024,
              channels: 3,
              background: s.profile.backgroundPalette[0],
            },
          })
            .png()
            .toBuffer()),
        reported: true,
      };
    }
    if (s.provider === 'fal')
      return (await import('./fal-studio.provider')).falStudioEdit(
        this.config,
        png,
        hash,
        preset,
        geometry,
      );
    return (await import('./gemini-studio.provider')).geminiStudioEdit(this.config, png, s.profile);
  }
  async edit(jpeg: Buffer, hash: string): Promise<EditResult> {
    const s = enhancementSettings(this.config);
    assertEditingApproved(this.config);
    if (s.provider === 'mock') {
      this.calls++;
      const fixture = this.fixtures.get(hash);
      if (fixture instanceof Error) throw fixture;
      return {
        bytes:
          fixture ??
          (await sharp({
            create: { width: 1024, height: 1024, channels: 3, background: '#fafafa' },
          })
            .png()
            .toBuffer()),
        reported: true,
      };
    }
    // Google is an optional capability. Its current image API contract/account hasn't been validated.
    if (s.provider !== 'fal') throw new ImageProviderError('IMAGE_GEMINI_ADAPTER_UNVERIFIED');
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), s.timeoutMs);
    try {
      this.calls++;
      const response = await fetch('https://fal.run/blackforestlabs/flux-3/klein/edit-image', {
        method: 'POST',
        redirect: 'error',
        signal: abort.signal,
        headers: {
          authorization: `Key ${this.config.get<string>('FAL_KEY')!}`,
          'content-type': 'application/json',
          'X-Fal-No-Retry': '1',
          'x-app-fal-disable-fallback': 'true',
          'X-Fal-Store-IO': '0',
          'X-Fal-Object-Lifecycle-Preference': JSON.stringify({
            expiration_duration_seconds: 3600,
          }),
        },
        body: JSON.stringify({
          prompt: EDIT_PROMPT,
          image_urls: [`data:image/jpeg;base64,${jpeg.toString('base64')}`],
          num_images: 1,
          image_size: { width: 1024, height: 1024 },
          enable_prompt_expansion: false,
          enable_safety_checker: true,
          output_format: 'png',
          sync_mode: true,
        }),
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new ImageProviderError(
          response.status === 429 ? 'IMAGE_PROVIDER_RATE_LIMIT' : 'IMAGE_PROVIDER_FAILED',
          true,
        );
      }
      const chunks: Uint8Array[] = [],
        reader = response.body.getReader();
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 17 * 1024 * 1024) {
          await reader.cancel();
          throw new ImageProviderError('IMAGE_PROVIDER_RESPONSE_TOO_LARGE', true);
        }
        chunks.push(value);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        images?: { url?: unknown }[];
        has_nsfw_concepts?: boolean[];
      };
      if (body.images?.length !== 1 || body.has_nsfw_concepts?.some(Boolean))
        throw new ImageProviderError('IMAGE_PROVIDER_UNSAFE_RESPONSE', true);
      const requestId = response.headers.get('x-fal-request-id');
      return {
        bytes: inlineImage(body.images[0].url),
        reported: true,
        ...(requestId && /^[A-Za-z0-9_-]{1,100}$/.test(requestId) ? { requestId } : {}),
      };
    } catch (e) {
      if (e instanceof ImageProviderError) throw e;
      throw new ImageProviderError('IMAGE_PROVIDER_OUTCOME_UNKNOWN', true);
    } finally {
      clearTimeout(timer);
    }
  }
}
