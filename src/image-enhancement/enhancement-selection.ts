import { ProductIntakeSession } from '@prisma/client';
import { InventoryTx, inventoryError as fail } from 'src/inventory/inventory-ledger';
import { isPromotionalCandidate } from './studio-media-role';
// Called only inside Phase 5's existing serializable submission. No network, inference or stock writes.
export async function selectedIntakeAsset(
  tx: InventoryTx,
  session: ProductIntakeSession,
  imageId: string,
  original: { id: string; url: string },
) {
  const decision = await tx.productImageEnhancementDecision.findFirst({
    where: { sessionId: session.id, imageId },
    orderBy: { revision: 'desc' },
    include: { selectedCandidate: { include: { job: true, asset: true } } },
  });
  if (!decision?.selectedCandidateId) return original;
  const candidate = decision.selectedCandidate;
  // A reviewed marketing image is NEVER authority for the factual primary.
  // Old promotional selections fail safely to the immutable original too.
  if (candidate && isPromotionalCandidate(candidate)) return original;
  if (
    !candidate ||
    candidate.job.sessionId !== session.id ||
    candidate.job.imageId !== imageId ||
    candidate.job.status !== 'COMPLETED' ||
    candidate.qualityStatus !== 'REVIEW_REQUIRED' ||
    !candidate.asset.intakePrivate ||
    candidate.asset.intakeProductId ||
    !candidate.asset.key.startsWith('products/intake-')
  )
    fail('IMAGE_SELECTION_INVALID', 'الصورة المختارة لم تعد صالحة؛ راجع المسودة');
  return candidate!.asset;
}
