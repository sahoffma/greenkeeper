import { describe, expect, it } from 'vitest'
import {
  formatNpkDeclarationDisplay,
  formatProductDescriptorDisplay,
  formatProductProfileProvenanceDisplay,
  formatRecognitionProvenanceDisplay,
  formatRecognitionResultScreenCopy,
  RECOGNITION_RESULT_SCREEN_CATALOG_HEADLINE,
  RECOGNITION_RESULT_SCREEN_PHOTO_HEADLINE,
  RECOGNITION_RESULT_SCREEN_SUBLINE,
} from './fertilizerProductDisplay'
import { formatRecognizedProductDisplay } from './fertilizerRecognitionCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductRecognizeResult } from '../types/productRecognize'

function minimalRecognitionResult(
  overrides: Partial<ProductRecognizeResult> = {},
): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 1,
    dataCompleteness: 0.5,
    recognition: {
      brand: { rawValue: null, normalizedValue: null, confidence: 0, source: null, evidence: null },
      productLine: { rawValue: null, normalizedValue: null, confidence: 0, source: null, evidence: null },
      productName: { rawValue: null, normalizedValue: null, confidence: 0, source: null, evidence: null },
      variant: { rawValue: null, normalizedValue: null, confidence: 0, source: null, evidence: null },
      manufacturer: { rawValue: null, normalizedValue: null, confidence: 0, source: null, evidence: null },
      productDescriptor: { rawValue: null, normalizedValue: null, confidence: 0, source: null, evidence: null },
      form: { rawValue: null, normalizedValue: 'unknown', confidence: 0, source: null, evidence: null },
      packageSize: {
        rawValue: null,
        normalizedValue: null,
        unit: null,
        confidence: 0,
        source: null,
        evidence: null,
      },
      npk: {
        rawLabel: null,
        nitrogen: null,
        phosphate: null,
        potash: null,
        confidence: 0,
        source: null,
        evidence: null,
      },
      nutrients: [],
      application: {
        rate: { value: null, unit: null, source: null, evidence: null },
        coverage: { value: null, unit: null, source: null, evidence: null },
        applicationPeriod: [],
        duration: { value: null, unit: null, source: null, evidence: null },
      },
    },
    catalogMatch: { matched: false, productId: null, matchType: null, confidence: 0 },
    sources: [],
    stockCapture: { allowed: true, persistToCatalog: false },
    nextAction: { type: 'none', message: null },
    diagnostics: { pipelineLatencies: {} },
    ...overrides,
  } as ProductRecognizeResult
}

describe('formatNpkDeclarationDisplay', () => {
  it('1 — behält ein einzelnes NPK-Präfix bei', () => {
    expect(formatNpkDeclarationDisplay('NPK 0-0-30')).toBe('NPK 0-0-30')
  })

  it('2 — ergänzt fehlendes Präfix', () => {
    expect(formatNpkDeclarationDisplay('0-0-30')).toBe('NPK 0-0-30')
  })

  it('3 — bereinigt überflüssige Leerzeichen und doppeltes Präfix', () => {
    expect(formatNpkDeclarationDisplay('  NPK   NPK  14-28-10  ')).toBe('NPK 14-28-10')
  })

  it('4 — leerer Wert bleibt leer', () => {
    expect(formatNpkDeclarationDisplay('')).toBeNull()
    expect(formatNpkDeclarationDisplay(null)).toBeNull()
    expect(formatNpkDeclarationDisplay('   ')).toBeNull()
  })
})

describe('formatProductDescriptorDisplay', () => {
  it('1 — vollständig großgeschriebener deutscher Deskriptor', () => {
    expect(formatProductDescriptorDisplay('RASENDÜNGER MIT SPURENÄHRSTOFFEN')).toBe(
      'Rasendünger mit Spurennährstoffen',
    )

    const nfdDescriptor = `RASENDÜNGER MIT SPURENA${String.fromCharCode(0x0308)}HRSTOFFEN`
    expect(formatProductDescriptorDisplay(nfdDescriptor)).toBe('Rasendünger mit Spurennährstoffen')
    expect(formatProductDescriptorDisplay('RASENDÜNGER MIT SPURNEHRSTOFFEN')).toBe(
      'Rasendünger mit Spurennährstoffen',
    )
  })

  it('2 — bereits sinnvoll geschriebener Deskriptor bleibt unverändert', () => {
    expect(formatProductDescriptorDisplay('Rasendünger mit Spurennährstoffen')).toBe(
      'Rasendünger mit Spurennährstoffen',
    )
  })

  it('3 — Ausgabe enthält nie die fehlerhafte Schreibweise Spurnehrstoffen', () => {
    const variants = [
      'RASENDÜNGER MIT SPURENÄHRSTOFFEN',
      'RASENDÜNGER MIT SPURENEHRSTOFFEN',
      'RASENDÜNGER MIT SPURNEHRSTOFFEN',
      `RASENDÜNGER MIT SPURENA${String.fromCharCode(0x0308)}HRSTOFFEN`,
    ]

    for (const variant of variants) {
      const formatted = formatProductDescriptorDisplay(variant)
      expect(formatted).not.toContain('Spurnehrstoffen')
      expect(formatted).toContain('Spurennährstoffen')
    }
  })

  it('4 — leerer Wert bleibt leer', () => {
    expect(formatProductDescriptorDisplay('')).toBeNull()
    expect(formatProductDescriptorDisplay(null)).toBeNull()
    expect(formatProductDescriptorDisplay('   ')).toBeNull()
  })

  it('5 — Produktname wird nicht über den Descriptor-Formatter verarbeitet', () => {
    expect(formatProductDescriptorDisplay('Stress-Manager')).toBe('Stress-Manager')
  })

  it('6 — NPK und übrige Produktinformationen bleiben unverändert', () => {
    const recognition = recognitionFromImageAnalysis({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      variant: null,
      productDescriptor: 'RASENDÜNGER MIT SPURENÄHRSTOFFEN',
      manufacturer: null,
      npkLabel: 'NPK 0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: 5,
      packageSizeUnit: 'kg',
      form: 'unknown',
      gtin: null,
      textFragments: [],
      fieldConfidence: { brand: 1, productLine: 1, productName: 1, npk: 1, packageSize: 1 },
    })

    const result = minimalRecognitionResult({ recognition })
    const display = formatRecognizedProductDisplay(result)

    expect(display.title).toContain('Stress-Manager')
    expect(display.descriptor).toBe('Rasendünger mit Spurennährstoffen')
    expect(display.npk).toBe('NPK 0-0-30')
    expect(display.packageSize).toBe('5 kg')
    expect(result.recognition.productDescriptor.normalizedValue).toBe(
      'RASENDÜNGER MIT SPURENÄHRSTOFFEN',
    )
  })
})

describe('formatProductProfileProvenanceDisplay', () => {
  it('1 — packaging_photo + unverified', () => {
    const display = formatProductProfileProvenanceDisplay({
      source: 'packaging_photo',
      verificationStatus: 'unverified',
      profileStatus: 'draft',
    })

    expect(display.sourceLabel).toBe('Verpackungsfoto')
    expect(display.statusLabel).toBe('Noch nicht verifiziert')
    expect(display.combinedLabel).toBe('Verpackungsfoto · Noch nicht verifiziert')
  })

  it('2 — verified/global Profil', () => {
    const display = formatProductProfileProvenanceDisplay({
      source: 'packaging_photo',
      verificationStatus: 'verified',
      profileStatus: 'verified',
    })

    expect(display.combinedLabel).toBe('Verifizierte Produktquelle')
  })

  it('3 — unbekannte Quelle ohne offizielle Behauptung', () => {
    const display = formatProductProfileProvenanceDisplay({
      source: 'unknown_source',
      verificationStatus: 'unverified',
      profileStatus: 'draft',
    })

    expect(display.sourceLabel).toBe('Erkannte Produktinformation')
    expect(display.combinedLabel).toContain('Noch nicht verifiziert')
    expect(display.combinedLabel).not.toContain('Offizielle')
  })
})

describe('formatRecognitionProvenanceDisplay', () => {
  it('ignoriert Web-Quellen für unverifizierte Foto-Erkennung', () => {
    const display = formatRecognitionProvenanceDisplay(
      minimalRecognitionResult({
        sources: [
          {
            type: 'official_manufacturer',
            title: 'Hersteller',
            url: 'https://example.com',
            retrievedAt: '2026-07-29T10:00:00.000Z',
          },
        ],
      }),
    )

    expect(display.combinedLabel).toBe('Verpackungsfoto · Noch nicht verifiziert')
  })

  it('zeigt Katalogtreffer als verifizierte Katalogquelle', () => {
    const display = formatRecognitionProvenanceDisplay(
      minimalRecognitionResult({
        catalogMatch: { matched: true, productId: 'prod-1', matchType: 'exact', confidence: 1 },
      }),
    )

    expect(display.combinedLabel).toBe('Greenkeeper-Katalog')
  })
})

describe('formatRecognizedProductDisplay', () => {
  it('liefert display-fertiges NPK und Verpackungsfoto-Herkunft', () => {
    const recognition = recognitionFromImageAnalysis({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      variant: null,
      productDescriptor: null,
      manufacturer: null,
      npkLabel: 'NPK 0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: 5,
      packageSizeUnit: 'kg',
      form: 'unknown',
      gtin: null,
      textFragments: [],
      fieldConfidence: { brand: 1, productLine: 1, productName: 1, npk: 1, packageSize: 1 },
    })

    const display = formatRecognizedProductDisplay(
      minimalRecognitionResult({
        recognition,
        sources: [
          {
            type: 'official_manufacturer',
            title: 'Hersteller',
            url: 'https://example.com',
            retrievedAt: '2026-07-29T10:00:00.000Z',
          },
        ],
      }),
    )

    expect(display.title).toContain('Stress-Manager')
    expect(display.npk).toBe('NPK 0-0-30')
    expect(display.provenanceLabel).toBe('Verpackungsfoto · Noch nicht verifiziert')
  })
})

describe('formatRecognitionResultScreenCopy', () => {
  it('1 — Foto-Erkennung: nutzerfreundliche Texte ohne technische Statussprache', () => {
    const copy = formatRecognitionResultScreenCopy(
      minimalRecognitionResult({
        sources: [
          {
            type: 'official_manufacturer',
            title: 'Hersteller',
            url: 'https://example.com',
            retrievedAt: '2026-07-29T10:00:00.000Z',
          },
        ],
      }),
    )

    expect(copy.headline).toBe(RECOGNITION_RESULT_SCREEN_PHOTO_HEADLINE)
    expect(copy.subline).toBe(RECOGNITION_RESULT_SCREEN_SUBLINE)
    expect(copy.headline).not.toMatch(/Quelle|Status|verifiziert|optional|Produktdaten/i)
    expect(copy.subline).not.toMatch(/Quelle|Status|verifiziert|optional|Produktdaten/i)
  })

  it('2 — Produktinformationen bleiben über formatRecognizedProductDisplay verfügbar', () => {
    const recognition = recognitionFromImageAnalysis({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      variant: null,
      productDescriptor: 'Rasendünger mit Spurennährstoffen',
      manufacturer: null,
      npkLabel: 'NPK 0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: 5,
      packageSizeUnit: 'kg',
      form: 'unknown',
      gtin: null,
      textFragments: [],
      fieldConfidence: { brand: 1, productLine: 1, productName: 1, npk: 1, packageSize: 1 },
    })

    const display = formatRecognizedProductDisplay(minimalRecognitionResult({ recognition }))

    expect(display.title).toContain('Stress-Manager')
    expect(display.npk).toBe('NPK 0-0-30')
    expect(display.packageSize).toBe('5 kg')
  })

  it('3 — interne Provenance bleibt für Detailansichten erhalten', () => {
    const result = minimalRecognitionResult()
    const provenance = formatRecognitionProvenanceDisplay(result)

    expect(provenance.sourceLabel).toBe('Verpackungsfoto')
    expect(provenance.statusLabel).toBe('Noch nicht verifiziert')
  })

  it('4 — Katalogtreffer: freundlich ohne Verifizierungsbehauptung', () => {
    const copy = formatRecognitionResultScreenCopy(
      minimalRecognitionResult({
        catalogMatch: { matched: true, productId: 'prod-1', matchType: 'exact', confidence: 1 },
      }),
    )

    expect(copy.headline).toBe(RECOGNITION_RESULT_SCREEN_CATALOG_HEADLINE)
    expect(copy.subline).toBe(RECOGNITION_RESULT_SCREEN_SUBLINE)
    expect(copy.headline).not.toMatch(/verifiziert|offiziell|geprüft/i)
  })
})
