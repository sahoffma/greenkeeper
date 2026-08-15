import { describe, expect, it } from 'vitest'
import {
  normalizeProductFamilyKey,
  normalizeProductFamilyKeyComponent,
  productFamilyKeysEquivalent,
} from './fertilizerProductFamilyKeyCore'

describe('fertilizerProductFamilyKeyCore', () => {
  it('normalizes whitespace, hyphen and unicode dash variants', () => {
    expect(normalizeProductFamilyKeyComponent('Stress Manager')).toBe('stress manager')
    expect(normalizeProductFamilyKeyComponent('Stress-Manager')).toBe('stress manager')
    expect(normalizeProductFamilyKeyComponent('Stress–Manager')).toBe('stress manager')
  })

  it('treats family keys with equivalent variant components as the same family', () => {
    const left = normalizeProductFamilyKey('rasendoktor|professional|stress manager')
    const right = normalizeProductFamilyKey('rasendoktor|professional|stress-manager')

    expect(left).toBe('rasendoktor|professional|stress manager')
    expect(productFamilyKeysEquivalent(left, right)).toBe(true)
  })
})
