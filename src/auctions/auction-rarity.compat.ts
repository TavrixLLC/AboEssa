import { AuctionRarity } from '@prisma/client';

// Older installed apps still send NORMAL until their next mobile release.
export const LEGACY_AUCTION_RARITY = 'NORMAL' as const;
export type AuctionRarityInput = AuctionRarity | typeof LEGACY_AUCTION_RARITY;
export const auctionRarityInputs = [...Object.values(AuctionRarity), LEGACY_AUCTION_RARITY];

export function normalizeAuctionRarity(
  rarity: AuctionRarityInput | null | undefined,
): AuctionRarity | null | undefined {
  return rarity === LEGACY_AUCTION_RARITY ? AuctionRarity.FEATURED : rarity;
}

export function legacyAdminAuctionRarity(rarity: AuctionRarity | null): AuctionRarityInput | null {
  return rarity === AuctionRarity.FEATURED ? LEGACY_AUCTION_RARITY : rarity;
}
