import { describe, expect, it } from 'vitest'
import { parseImageAnalysisResponse } from './productRecognizeImageCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import { mapRecognitionProductFormToEnrichment } from './fertilizerRecognitionEnrichmentBasisCore'

describe('productRecognizeImageCore form preservation', () => {
  it('coerces numeric string packageSizeValue from vision JSON', () => {
    const analysis = parseImageAnalysisResponse({
      brand: 'PlantCo',
      productLine: null,
      productName: 'Boost',
      variant: null,
      productDescriptor: null,
      manufacturer: 'PlantCo',
      npkLabel: '0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: '5',
      packageSizeUnit: 'kg',
      form: null,
      gtin: null,
      textFragments: [],
      fieldConfidence: { packageSize: 0.9 },
    })

    expect(analysis.packageSizeValue).toBe(5)
    expect(recognitionFromImageAnalysis(analysis).packageSize.normalizedValue).toBe(5)
  })

  it('preserves free-text vision form labels that are not enum values', () => {
    const analysis = parseImageAnalysisResponse({
      brand: 'PlantCo',
      productLine: null,
      productName: 'Herbst-Boost',
      variant: null,
      productDescriptor: 'Rasendünger',
      manufacturer: null,
      npkLabel: null,
      nitrogen: null,
      phosphate: null,
      potash: null,
      packageSizeValue: null,
      packageSizeUnit: null,
      form: 'Rasendünger / granular',
      gtin: null,
      textFragments: [],
      fieldConfidence: { form: 0.9 },
    })

    expect(analysis.form).toBeNull()
    expect(analysis.formLabel).toBe('Rasendünger / granular')

    const recognition = recognitionFromImageAnalysis(analysis)
    expect(recognition.form.rawValue).toBe('Rasendünger / granular')
    expect(recognition.form.normalizedValue).toBe('unknown')
    expect(
      mapRecognitionProductFormToEnrichment(
        recognition.form.rawValue,
        recognition.productDescriptor.normalizedValue,
      ),
    ).toBe('granular')
  })

  it('keeps enum form values on the enum field', () => {
    const analysis = parseImageAnalysisResponse({
      brand: 'PlantCo',
      productLine: null,
      productName: 'Herbst-Boost',
      variant: null,
      productDescriptor: null,
      manufacturer: null,
      npkLabel: null,
      nitrogen: null,
      phosphate: null,
      potash: null,
      packageSizeValue: null,
      packageSizeUnit: null,
      form: 'granular',
      gtin: null,
      textFragments: [],
      fieldConfidence: { form: 0.9 },
    })

    expect(analysis.form).toBe('granular')
    expect(analysis.formLabel).toBeNull()
  })
})
