import type {
  ProductRecognizeNextAction,
  ProductRecognizeRecognition,
  ProductRecognizeStatus,
  ProductRecognizeWebExtraction,
} from '../types/productRecognize'
import {
  computeIdentityConfidence,
  hasStrongProductIdentity,
  IDENTITY_CONFIDENCE_THRESHOLD,
} from './productRecognizeIdentityCore'

export function collectMissingIdentityFields(
  recognition: ProductRecognizeRecognition,
): string[] {
  const missing: string[] = []

  if (!recognition.brand.normalizedValue && !recognition.productLine.normalizedValue) {
    missing.push('brand')
  }

  if (!recognition.productName.normalizedValue && !recognition.variant.normalizedValue) {
    missing.push('productName')
  }

  if (recognition.npk.nitrogen == null || recognition.npk.phosphate == null) {
    missing.push('npk')
  }

  return missing
}

export function determineRecognitionStatus(input: {
  recognition: ProductRecognizeRecognition
  identityConfidence: number
  ambiguousVariant: boolean
  webExtraction: ProductRecognizeWebExtraction | null
  contradictorySources: boolean
}): ProductRecognizeStatus {
  if (input.ambiguousVariant || input.contradictorySources) {
    return 'needs_clarification'
  }

  if (input.identityConfidence >= IDENTITY_CONFIDENCE_THRESHOLD) {
    return 'identified'
  }

  if (input.identityConfidence >= 0.45) {
    return 'needs_clarification'
  }

  return 'not_identified'
}

export function determineNextAction(input: {
  status: ProductRecognizeStatus
  identityConfidence: number
  ambiguousVariant: boolean
  contradictorySources: boolean
  missingIdentityFields: string[]
  recognition: ProductRecognizeRecognition
}): ProductRecognizeNextAction {
  if (input.status === 'identified') {
    return { type: 'none', message: null }
  }

  if (input.ambiguousVariant) {
    return {
      type: 'request_back_photo',
      message:
        'Ich sehe mehrere plausible Varianten dieses Produkts. Fotografiere bitte zusätzlich die Rückseite mit Produktdeklaration und Barcode, damit ich die Variante eindeutig bestimmen kann.',
    }
  }

  if (input.contradictorySources) {
    return {
      type: 'request_back_photo',
      message:
        'Verschiedene Quellen nennen unterschiedliche Angaben zu diesem Produkt. Bitte fotografiere die Rückseite mit Deklaration und Barcode — dann kann ich die korrekten Werte sicher zuordnen.',
    }
  }

  if (input.missingIdentityFields.includes('productName')) {
    return {
      type: 'request_back_photo',
      message:
        'Ich konnte den Produktnamen oder die Variante noch nicht sicher lesen. Fotografiere bitte zusätzlich die Rückseite mit Produktdeklaration und Barcode.',
    }
  }

  if (input.identityConfidence < IDENTITY_CONFIDENCE_THRESHOLD) {
    return {
      type: 'request_back_photo',
      message:
        'Ich konnte das Produkt noch nicht eindeutig bestimmen. Fotografiere bitte zusätzlich die Rückseite mit Produktdeklaration und Barcode.',
    }
  }

  if (input.status === 'needs_clarification') {
    return {
      type: 'ask_question',
      message:
        'Ich habe das Produkt erkannt, bin mir bei einer Angabe aber noch unsicher. Kannst Du mir kurz sagen, welche Variante oder Gebindegröße Du gekauft hast?',
    }
  }

  return {
    type: 'request_back_photo',
    message:
      'Ich konnte das Produkt nicht sicher erkennen. Fotografiere bitte zusätzlich die Rückseite mit Produktdeklaration und Barcode.',
  }
}

export function hasContradictorySources(
  webExtraction: ProductRecognizeWebExtraction | null,
  recognition: ProductRecognizeRecognition,
): boolean {
  if (!webExtraction) return false

  const identityConflicts = webExtraction.conflicts.filter((conflict) =>
    /npk|produktname|variant|gebinde|marke/i.test(conflict),
  )

  if (identityConflicts.length > 0) {
    return true
  }

  for (const field of webExtraction.fields) {
    if (field.field !== 'npk' || typeof field.value !== 'object' || field.value == null) {
      continue
    }

    const npk = field.value as Record<string, number>
    if (
      (recognition.npk.nitrogen != null &&
        npk.nitrogen != null &&
        recognition.npk.nitrogen !== npk.nitrogen) ||
      (recognition.npk.phosphate != null &&
        npk.phosphate != null &&
        recognition.npk.phosphate !== npk.phosphate)
    ) {
      return true
    }
  }

  return false
}

export function computeIdentityConfidenceForDecision(
  recognition: ProductRecognizeRecognition,
): number {
  return computeIdentityConfidence(recognition)
}

export function canIdentifyWithoutWebOrCatalog(
  recognition: ProductRecognizeRecognition,
): boolean {
  return hasStrongProductIdentity(recognition)
}
