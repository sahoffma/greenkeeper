import type { ProductProfileSource, ProductProfileVerificationStatus } from '../types/productProfile'
import type { ProductRecognizeResult } from '../types/productRecognize'
import type { FertilizerRecognitionIdentityOrigin } from '../types/fertilizerRecognitionCandidate'

export interface ProductProvenanceDisplay {
  sourceLabel: string
  statusLabel: string | null
  combinedLabel: string
}

/** Normalisiert NPK-Deklarationen für die Anzeige — genau ein „NPK“-Präfix. */
export function formatNpkDeclarationDisplay(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null
  }

  let value = raw.trim().replace(/\s+/g, ' ')
  if (!value) {
    return null
  }

  while (/^npk\s+/i.test(value)) {
    value = value.replace(/^npk\s+/i, '').trim()
  }

  const npkMatch = value.match(
    /^(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)/,
  )

  if (npkMatch) {
    const normalizeNumber = (part: string) => part.replace(',', '.')
    return `NPK ${normalizeNumber(npkMatch[1])}-${normalizeNumber(npkMatch[2])}-${normalizeNumber(npkMatch[3])}`
  }

  return `NPK ${value}`
}

/** Anzeigeformatierung für Produkt-Deskriptoren — nur Darstellung, keine Speicherung. */
export function formatProductDescriptorDisplay(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null
  }

  const value = raw.trim().replace(/\s+/g, ' ').normalize('NFC')
  if (!value) {
    return null
  }

  if (!isFullyUppercaseDescriptor(value)) {
    return value
  }

  return toGermanDescriptorDisplayCase(value)
}

const DESCRIPTOR_LOWERCASE_WORDS = new Set([
  'mit',
  'und',
  'für',
  'oder',
  'von',
  'zu',
  'am',
  'im',
  'an',
  'in',
  'auf',
  'aus',
  'bei',
])

/** Bekannte Deskriptor-Wörter inkl. häufiger OCR-Varianten ohne Umlaut. */
const DESCRIPTOR_KNOWN_SPELLINGS: Record<string, string> = {
  spurenährstoffen: 'Spurennährstoffen',
  spurenehrstoffen: 'Spurennährstoffen',
  spurnehrstoffen: 'Spurennährstoffen',
}

function descriptorWordKey(word: string): string {
  return word.normalize('NFC').toLocaleLowerCase('de-DE')
}

function capitalizeDescriptorWord(word: string): string {
  const normalized = word.normalize('NFC')
  const lower = normalized.toLocaleLowerCase('de-DE')
  return lower.charAt(0).toLocaleUpperCase('de-DE') + lower.slice(1)
}

function resolveDescriptorWordDisplay(word: string): string {
  const key = descriptorWordKey(word)
  const known = DESCRIPTOR_KNOWN_SPELLINGS[key]
  if (known) {
    return known
  }

  if (DESCRIPTOR_LOWERCASE_WORDS.has(key)) {
    return key
  }

  return capitalizeDescriptorWord(word)
}

function toGermanDescriptorDisplayCase(value: string): string {
  return value
    .split(' ')
    .map((word) => {
      if (!word) {
        return word
      }

      return resolveDescriptorWordDisplay(word)
    })
    .join(' ')
}

function isFullyUppercaseDescriptor(value: string): boolean {
  if (/[a-zäöüß]/.test(value)) {
    return false
  }

  return /[A-ZÄÖÜ]/.test(value)
}

export function formatProductProfileProvenanceDisplay(input: {
  source: ProductProfileSource | string | null | undefined
  verificationStatus: ProductProfileVerificationStatus | string | null | undefined
  profileStatus?: 'draft' | 'verified' | null
}): ProductProvenanceDisplay {
  const isVerifiedProfile =
    input.profileStatus === 'verified' && input.verificationStatus === 'verified'

  if (isVerifiedProfile) {
    return {
      sourceLabel: 'Verifizierte Produktquelle',
      statusLabel: null,
      combinedLabel: 'Verifizierte Produktquelle',
    }
  }

  if (input.source === 'packaging_photo') {
    return {
      sourceLabel: 'Verpackungsfoto',
      statusLabel: 'Noch nicht verifiziert',
      combinedLabel: 'Verpackungsfoto · Noch nicht verifiziert',
    }
  }

  return {
    sourceLabel: 'Erkannte Produktinformation',
    statusLabel: 'Noch nicht verifiziert',
    combinedLabel: 'Erkannte Produktinformation · Noch nicht verifiziert',
  }
}

/** Erkennungsergebnis: Web-Quellen ändern nicht die nutzer sichtbare Verifizierung. */
export function formatRecognitionProvenanceDisplay(
  result: ProductRecognizeResult,
): ProductProvenanceDisplay {
  if (result.catalogMatch.matched) {
    return {
      sourceLabel: 'Greenkeeper-Katalog',
      statusLabel: null,
      combinedLabel: 'Greenkeeper-Katalog',
    }
  }

  return formatProductProfileProvenanceDisplay({
    source: 'packaging_photo',
    verificationStatus: 'unverified',
    profileStatus: 'draft',
  })
}

/** Nutzerfreundliche Texte für den Recognition-Ergebnisbildschirm im Erfassungsflow. */
export interface RecognitionResultScreenCopy {
  headline: string
  subline: string
}

export const RECOGNITION_RESULT_SCREEN_PHOTO_HEADLINE = 'Erkannt aus Deinem Foto'
export const RECOGNITION_RESULT_SCREEN_CATALOG_HEADLINE = 'Im Greenkeeper-Katalog gefunden'
export const RECOGNITION_RESULT_SCREEN_SUBLINE = 'Du kannst das Produkt jetzt übernehmen.'

/** Ergebnisbildschirm — ohne technische Quellen- oder Verifizierungssprache. */
export function formatRecognitionResultScreenCopy(
  result: ProductRecognizeResult,
): RecognitionResultScreenCopy {
  if (result.catalogMatch.matched) {
    return {
      headline: RECOGNITION_RESULT_SCREEN_CATALOG_HEADLINE,
      subline: RECOGNITION_RESULT_SCREEN_SUBLINE,
    }
  }

  return {
    headline: RECOGNITION_RESULT_SCREEN_PHOTO_HEADLINE,
    subline: RECOGNITION_RESULT_SCREEN_SUBLINE,
  }
}

/** Legacy-Herkunftstext — nur für interne Zuordnung, nicht für unverifizierte Foto-Flows. */
export function identityOriginLabel(origin: FertilizerRecognitionIdentityOrigin): string {
  switch (origin) {
    case 'greenkeeper_catalog':
      return 'Greenkeeper-Katalog'
    case 'official_product_source':
      return 'Offizielle Produktquelle'
    case 'packaging_photo':
      return 'Verpackungsfoto'
  }
}
