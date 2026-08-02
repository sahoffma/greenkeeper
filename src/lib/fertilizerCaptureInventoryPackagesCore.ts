import type { FertilizerInventoryBaseUnit } from '../types/fertilizerInventoryCore'
import type { FertilizerConfirmedPackageGroupInput } from './fertilizerInventoryCreationCore'
import type { FertilizerCaptureDraft } from './fertilizerCaptureCore'

export class FertilizerCaptureInventoryPackagesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FertilizerCaptureInventoryPackagesError'
  }
}

export function resolveCaptureInventoryBaseUnit(draft: FertilizerCaptureDraft): FertilizerInventoryBaseUnit {
  const unit = draft.selectedPackageUnit ?? draft.unit

  if (unit === 'kg' || unit === 'g') {
    if (unit === 'g') {
      throw new FertilizerCaptureInventoryPackagesError(
        'Gramm können nicht direkt gespeichert werden. Bitte gib die Menge in kg an.',
      )
    }

    return 'kg'
  }

  if (unit === 'ml' || unit === 'l') {
    if (unit === 'l') {
      throw new FertilizerCaptureInventoryPackagesError(
        'Liter können nicht direkt gespeichert werden. Bitte gib die Menge in ml an.',
      )
    }

    return 'ml'
  }

  throw new FertilizerCaptureInventoryPackagesError('Die Einheit ist für den Bestand ungültig.')
}

function resolveNominalPackageSize(draft: FertilizerCaptureDraft): number {
  if (draft.selectedPackageQuantity != null && draft.selectedPackageQuantity > 0) {
    return draft.selectedPackageQuantity
  }

  if (draft.quantity != null && draft.quantity > 0) {
    return draft.quantity
  }

  throw new FertilizerCaptureInventoryPackagesError('Die Packungsgröße fehlt.')
}

export function buildConfirmedPackageGroupsFromCaptureDraft(
  draft: FertilizerCaptureDraft,
): FertilizerConfirmedPackageGroupInput[] {
  const baseUnit = resolveCaptureInventoryBaseUnit(draft)
  const nominalSize = resolveNominalPackageSize(draft)
  const packageCount = draft.packageCount ?? 1
  const previousRemainder = draft.previousRemainder ?? 0

  if (previousRemainder > 0) {
    const groups: FertilizerConfirmedPackageGroupInput[] = [
      {
        packageSizeValue: nominalSize,
        packageSizeUnit: baseUnit,
        initialQuantityValue: previousRemainder,
        initialQuantityUnit: baseUnit,
        count: 1,
        clientCorrelationIdPrefix: 'capture-remainder',
      },
    ]

    if (packageCount > 1) {
      groups.push({
        packageSizeValue: nominalSize,
        packageSizeUnit: baseUnit,
        initialQuantityValue: nominalSize,
        initialQuantityUnit: baseUnit,
        count: packageCount - 1,
        clientCorrelationIdPrefix: 'capture-full',
      })
    }

    return groups
  }

  const initialQuantity =
    draft.selectedPackageQuantity != null && draft.packageCount != null
      ? nominalSize
      : (draft.quantity ?? nominalSize)

  if (initialQuantity <= 0) {
    throw new FertilizerCaptureInventoryPackagesError('Die bestätigte Menge ist ungültig.')
  }

  return [
    {
      packageSizeValue: nominalSize,
      packageSizeUnit: baseUnit,
      initialQuantityValue: initialQuantity,
      initialQuantityUnit: baseUnit,
      count: packageCount,
      clientCorrelationIdPrefix: 'capture-package',
    },
  ]
}
