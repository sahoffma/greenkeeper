import { describe, expect, it } from 'vitest'
import type { Area } from '../types/area'
import {
  buildCareViewOptions,
  canSubmitCareViewSelection,
  formatCareGroupLabel,
  resolveCareAssignmentFromSelection,
  shouldShowCareViewSection,
} from './careViewOptionsCore'

const area = (id: string, name: string): Area => ({
  id,
  name,
  subtitle: '',
  sizeLabel: '10 m²',
  status: 'observe',
  statusLabel: 'Entwicklung beobachten',
  summary: null,
})

describe('formatCareGroupLabel', () => {
  it('verbindet wenige Namen mit Plus', () => {
    expect(formatCareGroupLabel(['Rasenfläche 1', 'Rasenfläche 2'])).toBe('Rasenfläche 1 + Rasenfläche 2')
  })

  it('fasst längere Gruppen zusammen', () => {
    expect(formatCareGroupLabel(['Vorgarten', 'Terrasse', 'Seite', 'Hinten'])).toBe(
      'Vorgarten + Terrasse + 2 weitere',
    )
  })
})

describe('shouldShowCareViewSection', () => {
  it('blendet den Abschnitt ohne bestehende Flächen aus', () => {
    expect(shouldShowCareViewSection(0)).toBe(false)
  })

  it('zeigt den Abschnitt ab einer bestehenden Fläche', () => {
    expect(shouldShowCareViewSection(1)).toBe(true)
  })
})

describe('buildCareViewOptions', () => {
  it('listet Gruppen und einzelne Flächen', () => {
    const options = buildCareViewOptions(
      [area('a1', 'Rasenfläche 1'), area('a2', 'Rasenfläche 2'), area('a3', 'Rasenfläche 3')],
      [
        { careGroupId: 'g1', areaId: 'a1' },
        { careGroupId: 'g1', areaId: 'a2' },
      ],
    )

    expect(options).toHaveLength(2)
    expect(options[0]).toMatchObject({ type: 'group', label: 'Rasenfläche 1 + Rasenfläche 2' })
    expect(options[1]).toMatchObject({ type: 'area', label: 'Rasenfläche 3', hint: expect.any(String) })
  })

  it('liefert nur eine Option bei genau einer einzelnen Fläche', () => {
    const options = buildCareViewOptions([area('a1', 'Rasenfläche 1')], [])
    expect(options).toEqual([
      expect.objectContaining({ type: 'area', id: 'a1', label: 'Rasenfläche 1' }),
    ])
  })

  it('liefert keine Optionen bei leerer Flächenliste', () => {
    expect(buildCareViewOptions([], [])).toEqual([])
  })

  it('listet keine Gruppenoptionen ohne bestehende Pflegegruppen', () => {
    const options = buildCareViewOptions(
      [area('a1', 'A'), area('a2', 'B')],
      [],
    )

    expect(options).toEqual([
      expect.objectContaining({ type: 'area', id: 'a1' }),
      expect.objectContaining({ type: 'area', id: 'a2' }),
    ])
    expect(options.every((option) => option.type === 'area')).toBe(true)
  })

  it('bietet gruppierte Flächen nicht als Paar-Ziel an', () => {
    const options = buildCareViewOptions(
      [area('a1', 'A'), area('a2', 'B'), area('a3', 'C')],
      [
        { careGroupId: 'g1', areaId: 'a1' },
        { careGroupId: 'g1', areaId: 'a2' },
      ],
    )

    expect(options.some((option) => option.type === 'area' && option.id === 'a1')).toBe(false)
    expect(options.some((option) => option.type === 'area' && option.id === 'a2')).toBe(false)
    expect(options.some((option) => option.type === 'area' && option.id === 'a3')).toBe(true)
  })

  it('listet mehrere freie Flächen als Pair-Ziele', () => {
    const options = buildCareViewOptions(
      [area('a1', 'A'), area('a2', 'B'), area('a3', 'C')],
      [],
    )

    expect(options).toHaveLength(3)
    expect(options.map((option) => option.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('sortiert Gruppen vor freien Flächen deterministisch', () => {
    const options = buildCareViewOptions(
      [area('a1', 'A'), area('a2', 'B'), area('a3', 'C'), area('a4', 'D'), area('a5', 'E')],
      [
        { careGroupId: 'g2', areaId: 'a3' },
        { careGroupId: 'g2', areaId: 'a4' },
        { careGroupId: 'g1', areaId: 'a1' },
        { careGroupId: 'g1', areaId: 'a2' },
      ],
    )

    expect(options.map((option) => `${option.type}:${option.id}`)).toEqual([
      'group:g1',
      'group:g2',
      'area:a5',
    ])
  })
})

describe('submit selection', () => {
  const options = buildCareViewOptions(
    [area('a1', 'A'), area('a2', 'B'), area('a3', 'C')],
    [
      { careGroupId: 'g1', areaId: 'a1' },
      { careGroupId: 'g1', areaId: 'a2' },
    ],
  )

  it('erlaubt separates Anlegen ohne Auswahl', () => {
    expect(canSubmitCareViewSelection('separate', null, options)).toBe(true)
  })

  it('verlangt eine Zielauswahl beim Verbinden', () => {
    expect(canSubmitCareViewSelection('connect', null, options)).toBe(false)
    expect(canSubmitCareViewSelection('connect', 'g1', options)).toBe(true)
  })

  it('mappt Gruppe und einzelne Fläche auf RPC-Parameter', () => {
    expect(resolveCareAssignmentFromSelection('separate', null, options)).toEqual({
      joinCareGroupId: null,
      joinAreaId: null,
    })
    expect(resolveCareAssignmentFromSelection('connect', 'g1', options)).toEqual({
      joinCareGroupId: 'g1',
      joinAreaId: null,
    })
    expect(resolveCareAssignmentFromSelection('connect', 'a3', options)).toEqual({
      joinCareGroupId: null,
      joinAreaId: 'a3',
    })
  })

  it('lehnt unbekannte Ziel-IDs ab', () => {
    expect(resolveCareAssignmentFromSelection('connect', 'unknown', options)).toEqual({
      joinCareGroupId: null,
      joinAreaId: null,
    })
  })

  it('verlangt explizite Auswahl beim Verbinden', () => {
    expect(canSubmitCareViewSelection('connect', null, options)).toBe(false)
    expect(canSubmitCareViewSelection('connect', 'g1', options)).toBe(true)
  })

  it('mutiert Eingaben nicht', () => {
    const mode = 'connect' as const
    const selectedOptionId = 'a3'
    const optionsCopy = [...options]

    resolveCareAssignmentFromSelection(mode, selectedOptionId, optionsCopy)

    expect(mode).toBe('connect')
    expect(selectedOptionId).toBe('a3')
    expect(optionsCopy).toEqual(options)
  })
})
