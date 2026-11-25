export const TABLETOP_PLACEMENT_RECIPE = 'rezona-tabletop-native-grounding-v2';
export type TabletopPlacement = {
  camera: 'TOP_DOWN' | 'UPRIGHT';
  quarterTurns: 0 | 1 | 2 | 3;
  horizontal: number;
};
export function validateTabletopPlacement(p: unknown): TabletopPlacement {
  const v = p as Partial<TabletopPlacement> | null;
  if (
    !v ||
    !['TOP_DOWN', 'UPRIGHT'].includes(v.camera ?? '') ||
    !Number.isInteger(v.quarterTurns) ||
    Number(v.quarterTurns) < 0 ||
    Number(v.quarterTurns) > 3 ||
    typeof v.horizontal !== 'number' ||
    !Number.isFinite(v.horizontal) ||
    v.horizontal < 0.4 ||
    v.horizontal > 0.6 ||
    Object.keys(v).some((k) => !['camera', 'quarterTurns', 'horizontal'].includes(k))
  )
    throw Error('TABLETOP_PLACEMENT_REVIEW_REQUIRED');
  return { camera: v.camera!, quarterTurns: v.quarterTurns!, horizontal: v.horizontal };
}
export type TabletopGeometry = {
  recipe: string;
  sourceMaskBox: { left: number; top: number; width: number; height: number };
  rotatedSize: { width: number; height: number };
  canvasEdge: number;
  productScale: 1;
  clockwiseRotationDegrees: number;
  camera: TabletopPlacement['camera'];
  horizontalPlacement: number;
  foregroundOrigin: { x: number; y: number };
  contact: { x: number; y: number; spanLeft: number; spanRight: number; kind: string };
  table: { y: number; coverage: number; perspective: string };
  shadow: {
    recipe: string;
    keyFrom: string;
    castDx: number;
    castDy: number;
    castBlur: number;
    contactBlur: number;
    contactOpacity: number;
    castOpacity: number;
  };
};
export function planTabletopPlacement(
  box: TabletopGeometry['sourceMaskBox'],
  p: TabletopPlacement,
  contactSpan: { left: number; right: number },
  warm: boolean,
): TabletopGeometry {
  const width = p.quarterTurns % 2 ? box.height : box.width,
    height = p.quarterTurns % 2 ? box.width : box.height;
  const edge =
    Math.ceil(Math.max(1024, width / 0.76, height / (p.camera === 'UPRIGHT' ? 0.68 : 0.76)) / 64) *
    64;
  if (edge > 3072) throw Error('TABLETOP_NATIVE_TOO_LARGE_RECAPTURE');
  const x = Math.round(edge * p.horizontal - width / 2),
    y = p.camera === 'UPRIGHT' ? Math.round(edge * 0.84) - height : Math.round((edge - height) / 2);
  if (x < 32 || x + width > edge - 32 || y < 32 || y + height > edge - 32)
    throw Error('TABLETOP_PLACEMENT_WOULD_CLIP');
  return {
    recipe: TABLETOP_PLACEMENT_RECIPE,
    sourceMaskBox: box,
    rotatedSize: { width, height },
    canvasEdge: edge,
    productScale: 1,
    clockwiseRotationDegrees: p.quarterTurns * 90,
    camera: p.camera,
    horizontalPlacement: p.horizontal,
    foregroundOrigin: { x, y },
    contact: {
      x: x + (contactSpan.left + contactSpan.right) / 2,
      y: y + height - 1,
      spanLeft: x + contactSpan.left,
      spanRight: x + contactSpan.right,
      kind:
        p.camera === 'TOP_DOWN'
          ? 'CAPTURED_ALPHA_FOOTPRINT_ON_TABLE'
          : 'REVIEWED_LOWER_ALPHA_BOUNDARY',
    },
    table: {
      y: p.camera === 'TOP_DOWN' ? 0 : Math.round(edge * 0.57),
      coverage: p.camera === 'TOP_DOWN' ? 1 : 0.43,
      perspective:
        p.camera === 'TOP_DOWN'
          ? 'near-overhead source view; no reprojection or invented wall'
          : 'employee-confirmed upright source; surface below reviewed contact; no product reprojection',
    },
    shadow: {
      recipe:
        p.camera === 'TOP_DOWN'
          ? 'alpha-contact-plus-directional-cast-v2'
          : 'lower-boundary-contact-v2',
      keyFrom: 'UPPER_LEFT',
      castDx: Math.round(edge * (warm ? 0.013 : 0.009)),
      castDy: Math.round(edge * 0.011),
      castBlur: Math.max(5, Math.round(edge * 0.006)),
      contactBlur: 1.3,
      contactOpacity: 0.2,
      castOpacity: warm ? 0.13 : 0.1,
    },
  };
}
