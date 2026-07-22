import type { Product } from '../types/product'
import type { ProductUserTrustDisplay, ProductVerificationStatus } from '../types/productGovernance'

function formatGermanDate(iso: string | null): string | null {
  if (!iso) {
    return null
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function verificationLabel(status: ProductVerificationStatus | null): string {
  switch (status) {
    case 'verified':
      return 'Verifiziert'
    case 'legacy_imported':
      return 'Technisch übernommen'
    case 'pending_review':
      return 'In Prüfung'
    case 'incomplete':
      return 'Unvollständig'
    case 'disputed':
      return 'Umstritten'
    case 'archived':
      return 'Archiviert'
    case 'draft':
    default:
      return 'Entwurf'
  }
}

/**
 * Nutzer-sichtbare Vertrauensinformation – ohne interne Prozentwerte.
 */
export function buildProductUserTrustDisplay(product: Pick<
  Product,
  | 'verificationStatus'
  | 'verifiedAt'
  | 'lastReviewedAt'
  | 'sources'
  | 'primarySourceUrl'
  | 'datasheetUrl'
  | 'manufacturerUrl'
  | 'hasOpenChangeRequest'
  | 'legacyImportedAt'
>): ProductUserTrustDisplay {
  const hasSourceEvidence =
    product.sources.length > 0 ||
    Boolean(product.primarySourceUrl) ||
    Boolean(product.datasheetUrl) ||
    Boolean(product.manufacturerUrl)

  const lastReviewedAt = product.lastReviewedAt ?? product.verifiedAt
  const lastReviewedLabel = lastReviewedAt
    ? `Zuletzt geprüft am ${formatGermanDate(lastReviewedAt)}`
    : product.verificationStatus === 'legacy_imported'
      ? 'Noch nicht im Review-Workflow geprüft'
      : null

  return {
    verificationLabel: product.hasOpenChangeRequest
      ? 'Änderung in Prüfung'
      : verificationLabel(product.verificationStatus),
    lastReviewedLabel,
    hasSourceEvidence,
    changeUnderReview: product.hasOpenChangeRequest,
    isLegacyImported: product.verificationStatus === 'legacy_imported',
  }
}
