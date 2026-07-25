import { describe, expect, it } from 'vitest'
import {
  buildCareSelectionNavigation,
  buildDefaultLawnNames,
  buildLawnAreaName,
  buildLawnCountStepUrl,
  buildMultipleCareStepUrl,
  buildMultipleSizeStepUrl,
  buildMultipleSummaryStepUrl,
  buildSingleAreaSizeStepUrl,
  isValidCustomMultipleLawnCount,
  parseLawnCarePreference,
  parseMultipleLawnCount,
  parseOnboardingLawnCount,
  resolveLegacyCountRoute,
  resolveMultipleSizeBackUrl,
  resolveMultipleSizeNavigation,
} from './onboardingFlow'

describe('onboardingFlow', () => {
  it('leitet Auswahl 1 direkt zur Einzelflächen-Größeneingabe', () => {
    expect(buildSingleAreaSizeStepUrl()).toBe('/onboarding/3?areas=single&count=1')
    expect(parseOnboardingLawnCount('1')).toBe(1)
  })

  it('leitet Auswahl 2 und 3 direkt zur Pflegefrage', () => {
    expect(buildMultipleCareStepUrl(2)).toBe('/onboarding/2/care?count=2')
    expect(buildMultipleCareStepUrl(3)).toBe('/onboarding/2/care?count=3')
  })

  it('leitet count=4 weiterhin korrekt zur Pflegefrage', () => {
    expect(buildMultipleCareStepUrl(4)).toBe('/onboarding/2/care?count=4')
    expect(resolveLegacyCountRoute(new URLSearchParams('count=4'))).toBe('/onboarding/2?count=4')
  })

  it('führt nach Pflegeauswahl direkt zur Größenabfrage', () => {
    expect(buildCareSelectionNavigation('together', 2)).toEqual({
      careStepUrl: '/onboarding/2/care?count=2&care=together',
      nextStepUrl:
        '/onboarding/3?areas=multiple&care=together&count=2&index=1&name1=Rasenfl%C3%A4che+1&name2=Rasenfl%C3%A4che+2',
    })
  })

  it('akzeptiert bei „Mehr als 3“ nur 4 bis 20', () => {
    expect(isValidCustomMultipleLawnCount('4')).toBe(true)
    expect(isValidCustomMultipleLawnCount('20')).toBe(true)
    expect(isValidCustomMultipleLawnCount('3')).toBe(false)
    expect(isValidCustomMultipleLawnCount('21')).toBe(false)
    expect(parseMultipleLawnCount('4')).toBe(4)
    expect(parseMultipleLawnCount('21')).toBeNull()
  })

  it('leitet nach gültiger Eingabe bei „Mehr als 3“ zur Pflegefrage', () => {
    expect(buildMultipleCareStepUrl(4)).toBe('/onboarding/2/care?count=4')
  })

  it('behandelt die alte Route /onboarding/2/count', () => {
    expect(
      resolveLegacyCountRoute(new URLSearchParams('care=together&count=3')),
    ).toBe('/onboarding/2/care?count=3&care=together')

    expect(resolveLegacyCountRoute(new URLSearchParams('count=2'))).toBe('/onboarding/2?count=2')

    expect(resolveLegacyCountRoute(new URLSearchParams('count=1'))).toBe(
      '/onboarding/3?areas=single&count=1',
    )

    expect(resolveLegacyCountRoute(new URLSearchParams(''))).toBe('/onboarding/2')
  })

  it('erzeugt automatische Namen', () => {
    expect(buildLawnAreaName(1)).toBe('Rasenfläche 1')
    expect(buildDefaultLawnNames(3)).toEqual(['Rasenfläche 1', 'Rasenfläche 2', 'Rasenfläche 3'])
  })

  it('speichert Größen je Fläche und Namen in der URL', () => {
    const url = buildMultipleSizeStepUrl({
      care: 'together',
      count: 2,
      names: ['Rasenfläche 1', 'Rasenfläche 2'],
      sizes: [50, null],
      index: 2,
    })

    const params = new URLSearchParams(url.split('?')[1] ?? '')
    expect(params.get('areas')).toBe('multiple')
    expect(params.get('care')).toBe('together')
    expect(params.get('count')).toBe('2')
    expect(params.get('index')).toBe('2')
    expect(params.get('name1')).toBe('Rasenfläche 1')
    expect(params.get('name2')).toBe('Rasenfläche 2')
    expect(params.get('size1')).toBe('50')
    expect(params.get('size2')).toBeNull()
  })

  it('leitet zwischen Mehrflächen-Größenschritten weiter', () => {
    const nextUrl = resolveMultipleSizeNavigation({
      care: 'together',
      count: 2,
      names: ['Rasenfläche 1', 'Rasenfläche 2'],
      sizes: [null, null],
      index: 1,
      nextSize: null,
    })

    expect(nextUrl).toContain('index=2')
    expect(nextUrl).not.toContain('size1=')
  })

  it('liefert für den letzten Größenschritt weiterhin eine Legacy-Zusammenfassungs-URL', () => {
    const summaryUrl = resolveMultipleSizeNavigation({
      care: 'together',
      count: 2,
      names: ['Rasenfläche 1', 'Rasenfläche 2'],
      sizes: [30, null],
      index: 2,
      nextSize: 45,
    })

    expect(summaryUrl).toBe(
      buildMultipleSummaryStepUrl({
        care: 'together',
        count: 2,
        names: ['Rasenfläche 1', 'Rasenfläche 2'],
        sizes: [30, 45],
      }),
    )
  })

  it('behält Anzahl, Pflegepräferenz und Größen bei Zurücknavigation', () => {
    const careBackUrl = resolveMultipleSizeBackUrl({
      care: 'separate',
      count: 3,
      names: buildDefaultLawnNames(3),
      sizes: [40, null, null],
      index: 1,
    })

    expect(careBackUrl).toBe('/onboarding/2/care?count=3&care=separate')

    const sizeBackUrl = resolveMultipleSizeBackUrl({
      care: 'separate',
      count: 3,
      names: buildDefaultLawnNames(3),
      sizes: [40, null, null],
      index: 2,
    })

    expect(sizeBackUrl).toContain('index=1')
    expect(sizeBackUrl).toContain('size1=40')
    expect(buildLawnCountStepUrl(3)).toBe('/onboarding/2?count=3')
  })

  it('lehnt ungültige Pflegepräferenzen ab', () => {
    expect(parseLawnCarePreference('grouped')).toBeNull()
    expect(parseLawnCarePreference(null)).toBeNull()
  })
})
