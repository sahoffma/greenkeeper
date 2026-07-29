/** Demonstrationsdaten für UI-Prototyp — nicht verifizierte Produktdaten. */

export const FERTILIZER_CAPTURE_FIXTURE_DISCLAIMER =
  'Demonstrationsdaten — nicht verifizierte Produktdaten'

export type FertilizerCaptureProductForm = 'granular' | 'liquid'

export interface FertilizerCapturePackageFixture {
  quantity: number
  unit: 'kg' | 'l'
  label: string
}

export interface FertilizerCaptureProductFixture {
  id: string
  manufacturer: string
  name: string
  productForm: FertilizerCaptureProductForm
  packageSizes: FertilizerCapturePackageFixture[]
  isFixture: true
}

export const FERTILIZER_CAPTURE_FIXTURE_PRODUCTS: FertilizerCaptureProductFixture[] = [
  {
    id: 'fixture-rasenduenger-classic',
    manufacturer: 'Fixture',
    name: 'Rasendünger Classic',
    productForm: 'granular',
    packageSizes: [{ quantity: 20, unit: 'kg', label: '20 kg' }],
    isFixture: true,
  },
  {
    id: 'fixture-icl-all-season',
    manufacturer: 'Fixture ICL',
    name: 'All Season',
    productForm: 'granular',
    packageSizes: [
      { quantity: 7, unit: 'kg', label: '7 kg' },
      { quantity: 25, unit: 'kg', label: '25 kg' },
    ],
    isFixture: true,
  },
  {
    id: 'fixture-fluessig-booster',
    manufacturer: 'Fixture',
    name: 'Flüssig-Rasenbooster',
    productForm: 'liquid',
    packageSizes: [{ quantity: 10, unit: 'l', label: '10 l' }],
    isFixture: true,
  },
]

export function findFixtureProductById(id: string): FertilizerCaptureProductFixture | undefined {
  return FERTILIZER_CAPTURE_FIXTURE_PRODUCTS.find((product) => product.id === id)
}
