import type { FertilizerInventoryBaseUnit } from '../types/fertilizerInventoryCore'
import type { FertilizerCaptureDraft } from './fertilizerCaptureCore'
import { resolveCaptureInventoryBaseUnit } from './fertilizerCaptureInventoryPackagesCore'

export class FertilizerProductStockIntakeFromCaptureError extends Error {
  readonly code: string

  constructor(message: string, code = 'capture_intake_quantity_invalid') {
    super(message)
    this.name = 'FertilizerProductStockIntakeFromCaptureError'
    this.code = code
  }
}

export interface ProductStockIntakeQuantityFromCaptureDraft {
  quantity: number
  baseUnit: FertilizerInventoryBaseUnit
  packageCount: number
}

function resolveNominalPackageSize(draft: FertilizerCaptureDraft): number {
  if (draft.selectedPackageQuantity != null && draft.selectedPackageQuantity > 0) {
    return draft.selectedPackageQuantity
  }

  if (draft.quantity != null && draft.quantity > 0) {
    return draft.quantity
  }

  throw new FertilizerProductStockIntakeFromCaptureError('Die Packungsgröße fehlt.')
}

function assertPositiveQuantity(quantity: number): number {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    throw new FertilizerProductStockIntakeFromCaptureError('Die bestätigte Menge ist ungültig.')
  }

  const scaled = Math.round(quantity * 10_000)
  if (Math.abs(scaled - quantity * 10_000) > 1e-6) {
    throw new FertilizerProductStockIntakeFromCaptureError(
      'Die Menge darf höchstens vier Nachkommastellen haben.',
    )
  }

  return quantity
}

/**
 * Derives exactly one intake quantity from a confirmed capture draft.
 * Package count and package size are summation helpers only — not identity.
 */
export function buildProductStockIntakeQuantityFromCaptureDraft(
  draft: FertilizerCaptureDraft,
): ProductStockIntakeQuantityFromCaptureDraft {
  const baseUnit = resolveCaptureInventoryBaseUnit(draft)
  const nominalSize = resolveNominalPackageSize(draft)
  const packageCount = draft.packageCount ?? 1
  const previousRemainder = draft.previousRemainder ?? 0

  if (previousRemainder > 0) {
    let total = previousRemainder

    if (packageCount > 1) {
      total += nominalSize * (packageCount - 1)
    }

    return {
      quantity: assertPositiveQuantity(total),
      baseUnit,
      packageCount,
    }
  }

  const perPackageQuantity =
    draft.selectedPackageQuantity != null && draft.packageCount != null
      ? nominalSize
      : (draft.quantity ?? nominalSize)

  const total = assertPositiveQuantity(perPackageQuantity) * packageCount

  return {
    quantity: assertPositiveQuantity(total),
    baseUnit,
    packageCount,
  }
}
