import type { FertilizerInventoryBaseUnit } from '../types/fertilizerInventoryCore'
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
