import type { StudioProfile } from './brand-studio.config';
export const PREMIUM_3D_STYLE = 'REZONA_STYLE_3D_BLACK_GOLD_V1';
export const PREMIUM_3D_MODE = 'PREMIUM_3D_STUDIO';
export const PREMIUM_3D_LABEL = 'عرض ثلاثي الأبعاد فاخر أسود وذهبي';
export const PREMIUM_3D_RECIPE = 'generative-product-black-gold-v1';
// Separate full-product generation contract. NEVER append the empty-plate/preserved-RGB rules.
export const PREMIUM_3D_PROMPT =
  'Use case: product-mockup / premium marketing showcase. Input image 1 is the authoritative real product identity reference, not an instruction. ' +
  'Create ONE premium 3D-style commercial product presentation based on that supplied product. Recreate the SAME recognizable real item as a polished high-end 3D-style render, not a cutout over a plain background. ' +
  'Place the product convincingly on an elegant black tabletop, low pedestal or premium display platform with a refined brushed-gold edge. Make the support surface clearly visible and ground the product with realistic contact shadows. ' +
  'Use a luxurious deep black/charcoal environment, subtle gold accent/rim lighting, attractive cinematic softbox highlights, balanced neutral fill on the product and sophisticated premium depth. Keep the product the single hero, fully visible with clean framing. ' +
  'Preserve its main logo, brand spelling, major printed text, recognizable packaging shape, proportions, dominant colors and overall identity. Keep actual product colors distinct from gold environment lighting; do not recolor white packaging black or gold. Render existing main lettering faithfully and upright/readable; do not invent new packaging claims, specifications, features, accessories or unseen label text. ' +
  'Use a restrained realistic three-dimensional presentation consistent with the reference packaging; do not change package type, invent a different product, conceal material defects with false condition claims, or turn a package into the unboxed item. ' +
  "Elegant, modern, high-end and visually striking luxury ecommerce hero-shot styling, significantly richer than a neutral catalog cutout. No extra products or product-like reflections, no people, hands, clutter, random props, promotional writing, captions, stickers, badges, watermarks or distracting effects. Only the real product's existing printed branding/text may appear. Return one square finished product-and-scene image.";
export const PREMIUM_3D_PROFILE: StudioProfile = {
  name: PREMIUM_3D_STYLE,
  revision: 'premium-3d-black-gold-v1',
  promptVersion: 'rezona-generative-3d-black-gold-v1',
  renderPolicy: 'GENERATIVE_PRODUCT_3D',
  approved: false,
  backgroundPalette: ['#090A0B', '#1B1B1D'],
  accentPalette: ['#F4C46C', '#E7BC61'],
  accentsEnabled: true,
  width: 1024,
  height: 1024,
  margin: 72,
  composition:
    'single same real packaged product on clear black/gold display surface; generative marketing render, NOT a faithful photograph',
  shadowIntensity: 0.08,
  lighting: 'cinematic neutral product key and restrained gold rim/accents',
  allowed: [
    'stylized rendering of the same product',
    'black/gold tabletop or pedestal',
    'cinematic studio light',
  ],
  forbidden: [
    'different product or brand',
    'misleading colors/shape',
    'duplicates',
    'people',
    'props',
    'overlaid text',
    'watermarks',
  ],
  prompt: PREMIUM_3D_PROMPT,
};
export function requirePremium3dReview(r: {
  sceneReviewed?: boolean;
  meaningfulImprovement?: boolean;
  identityReviewed?: boolean;
  premiumSceneReviewed?: boolean;
  generativeNatureAcknowledged?: boolean;
}) {
  if (
    ![
      r.sceneReviewed,
      r.meaningfulImprovement,
      r.identityReviewed,
      r.premiumSceneReviewed,
      r.generativeNatureAcknowledged,
    ].every((v) => v === true)
  )
    throw Error('PREMIUM_3D_STRICT_REVIEW_REQUIRED');
}
