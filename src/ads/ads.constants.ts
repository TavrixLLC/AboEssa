import { AdLinkType, AdPlacement } from '@prisma/client';

/** Current product ad placements. Legacy Live placements remain in Prisma for history only. */
export const CURRENT_AD_PLACEMENTS = [
  AdPlacement.STORE_HERO,
  AdPlacement.STORE_INLINE,
  AdPlacement.SETTINGS_PROMO,
  AdPlacement.HOME_BANNER,
  AdPlacement.AUCTIONS_PAGE,
  AdPlacement.IN_APP_CARD,
] as const;

export const DECOMMISSIONED_AD_PLACEMENTS: AdPlacement[] = [
  AdPlacement.LIVE_BANNER,
  AdPlacement.BEFORE_LIVE,
  AdPlacement.LIVE_BOTTOM,
];

/** Current product destinations. LIVE remains a historical database enum value only. */
export const CURRENT_AD_LINK_TYPES = [
  AdLinkType.NONE,
  AdLinkType.CATEGORY,
  AdLinkType.PRODUCT,
  AdLinkType.AUCTION,
  AdLinkType.EXTERNAL_URL,
] as const;
