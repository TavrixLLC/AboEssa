import { ConfigService } from '@nestjs/config';
import { readFile, stat } from 'node:fs/promises';
import { normalize } from 'node:path';
import type { StudioGroup, StudioSourceKind } from './studio-templates';
import type { TabletopPlacement } from './tabletop-placement';
export type RealStudioPhotoReview = {
  photoId: string;
  tag: string;
  filename: string;
  label: string;
  sha256: string;
  sourceStatus: string;
  sessionId: string | null;
  clientImageId: string | null;
  sourceCandidateId: string | null;
  sourceHash: string | null;
  maskHash: string | null;
  suggestedGroup: StudioGroup;
  sourceKind: StudioSourceKind;
  recommendedTemplateId: string;
  templateVersion: number;
  placement: TabletopPlacement;
  segmentationStatus: string;
  segmentationMethod: string;
  reasonAr: string;
  previewAllowed: boolean;
  employeeReview: 'PENDING';
  providerStatus: 'REAL_FAL_NOT_AUTHORIZED';
  priorQaProductId: string | null;
};
export type RealStudioReviewIndex = {
  datasetId: string;
  evaluatedAt: string;
  photos: RealStudioPhotoReview[];
};
export function assertRealStudioReviewScope(c: ConfigService) {
  let target = false;
  try {
    const u = new URL(c.get<string>('DATABASE_URL') ?? '');
    target =
      u.hostname === '127.0.0.1' &&
      u.port === '55456' &&
      /^\/rezona_real_studio_qa_[a-f0-9]{8}$/.test(u.pathname);
  } catch {
    /* disabled */
  }
  const file = normalize(c.get<string>('REAL_PRODUCT_STUDIO_REVIEW_INDEX') ?? '').replace(
    /\\/g,
    '/',
  );
  if (
    c.get('REAL_PRODUCT_STUDIO_REVIEW_ENABLED') !== 'true' ||
    c.get('NODE_ENV') !== 'test' ||
    !target ||
    !/^D:\/rezona-real-studio-qa\/run-[a-f0-9]{8}\/review-index\.json$/.test(file)
  )
    throw Error('REAL_STUDIO_REVIEW_DISABLED');
  return file;
}
export async function readRealStudioReview(c: ConfigService): Promise<RealStudioReviewIndex> {
  const file = assertRealStudioReviewScope(c);
  if ((await stat(file)).size > 512000) throw Error('REAL_STUDIO_INDEX_INVALID');
  const value = JSON.parse(await readFile(file, 'utf8')) as RealStudioReviewIndex;
  if (
    !/^[a-f0-9]{8}$/.test(value.datasetId) ||
    !Array.isArray(value.photos) ||
    value.photos.length > 64 ||
    new Set(value.photos.map((p) => p.photoId)).size !== value.photos.length
  )
    throw Error('REAL_STUDIO_INDEX_INVALID');
  for (const p of value.photos)
    if (
      !/^(RP-[a-f0-9]{16}|MISSING-P\d{2}|INVALID-[a-f0-9]{12})$/.test(p.photoId) ||
      p.employeeReview !== 'PENDING' ||
      p.providerStatus !== 'REAL_FAL_NOT_AUTHORIZED' ||
      typeof p.previewAllowed !== 'boolean'
    )
      throw Error('REAL_STUDIO_INDEX_INVALID');
  return value;
}
