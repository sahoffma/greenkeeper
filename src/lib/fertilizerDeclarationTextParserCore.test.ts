import { describe, expect, it } from 'vitest'
import { parseFertilizerDeclarationText } from './fertilizerDeclarationTextParserCore'

describe('fertilizerDeclarationTextParserCore', () => {
  it('parses sulfur and iron from generic German composition text', () => {
    const parsed = parseFertilizerDeclarationText(
      [
        'Manufacturer: Example',
        'Product: Kalium-Spezial',
        'NPK 0-0-30',
        'Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 3,0 % Eisen (Fe)',
      ].join('\n'),
    )

    expect(parsed.nutrients.find((entry) => entry.key === 'sulfur')?.value).toBe(10.2)
    expect(parsed.nutrients.find((entry) => entry.key === 'iron')?.value).toBe(3)
    expect(parsed.nutrients.find((entry) => entry.key === 'potash')?.value).toBe(30)
    expect(parsed.declarationSectionFullyCaptured).toBe(true)
  })

  it('keeps explicitly declared zero values', () => {
    const parsed = parseFertilizerDeclarationText(
      [
        'Product: Example',
        'NPK 12-0-8',
        'Iron (Fe): 0%',
        'Declaration section complete',
      ].join('\n'),
    )

    expect(parsed.nutrients.find((entry) => entry.key === 'iron')?.value).toBe(0)
  })

  it('does not mark NPK-only synthetic text as fully captured without completion marker', () => {
    const parsed = parseFertilizerDeclarationText(
      [
        'Manufacturer: Example',
        'Product: Example',
        'NPK 0-0-30',
        'Declaration basis (N / P2O5 / K2O)',
        'Nitrogen (N): 0%',
        'Phosphate (P2O5): 0%',
        'Potash (K2O): 30%',
      ].join('\n'),
    )

    expect(parsed.declarationSectionFullyCaptured).toBe(false)
  })
})
