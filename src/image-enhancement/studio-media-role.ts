import { STUDIO_HERO_JOB } from './studio-templates';
export const isGenerativeImageMode = (mode: string) =>
  mode === 'PREMIUM_3D_STUDIO' || mode === STUDIO_HERO_JOB;
export function isPromotionalCandidate(c: {
  mediaRole?: string;
  job: { mode: string; parameters?: unknown };
}) {
  const p = c.job.parameters as
    { renderPolicy?: string; studioSelection?: { processingMode?: string } } | undefined;
  return (
    c.mediaRole === 'AI_PROMOTIONAL' ||
    isGenerativeImageMode(c.job.mode) ||
    p?.renderPolicy === 'GENERATIVE_PRODUCT_3D' ||
    p?.studioSelection?.processingMode === 'GENERATIVE_3D_HERO'
  );
}
