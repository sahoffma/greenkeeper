import { describe, expect, it } from 'vitest'
import {
  extractPackageSizeFromTextFragments,
  parsePackageSizeFromRawText,
} from './productRecognizePackageSizeParseCore'

describe('productRecognizePackageSizeParseCore', () => {
  it('parses common package size labels', () => {
    expect(parsePackageSizeFromRawText('5 kg')).toEqual({ value: 5, unit: 'kg' })
    expect(parsePackageSizeFromRawText('500 g')).toEqual({ value: 500, unit: 'g' })
    expect(parsePackageSizeFromRawText('1 l')).toEqual({ value: 1, unit: 'l' })
    expect(parsePackageSizeFromRawText('500 ml')).toEqual({ value: 500, unit: 'ml' })
  })

  it('extracts the last package-size token from OCR fragments', () => {
    expect(
      extractPackageSizeFromTextFragments(['Rasendünger', 'Nettoinhalt 5 kg', '0-0-30']),
    ).toEqual({ value: 5, unit: 'kg' })
  })
})
