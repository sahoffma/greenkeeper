import { describe, expect, it } from 'vitest'
import type { Area } from '../types/area'
import {
  buildCareGroupSummaries,
  buildManageAreasLayout,
  canStartConnectMode,
  canSubmitConnectSelection,
  getCareGroupIdForArea,
  getCareGroupDisplayNumber,
  getUngroupedAreaIds,
  isAreaEligibleForConnect,
  validateConnectSelection,
} from './careGroupsCore'

const areaA: Area = {
  id: 'a1',
  name: 'A',
  subtitle: '',
  sizeLabel: '10 m²',
  status: 'observe',
  statusLabel: 'Entwicklung beobachten',
  summary: null,
}

const areaB: Area = {
  id: 'a2',
  name: 'B',
  subtitle: '',
  sizeLabel: '20 m²',
  status: 'observe',
  statusLabel: 'Entwicklung beobachten',
  summary: null,
}

const areaC: Area = {
  id: 'a3',
  name: 'C',
  subtitle: '',
  sizeLabel: '30 m²',
  status: 'observe',
  statusLabel: 'Entwicklung beobachten',
  summary: null,
}

describe('buildCareGroupSummaries', () => {
  it('ignoriert Gruppen mit weniger als zwei Flächen', () => {
    const summaries = buildCareGroupSummaries([
      { careGroupId: 'g1', areaId: 'a1' },
      { careGroupId: 'g2', areaId: 'a2' },
      { careGroupId: 'g3', areaId: 'a3' },
      { careGroupId: 'g3', areaId: 'a4' },
    ])

    expect(summaries).toEqual([{ id: 'g3', areaIds: ['a3', 'a4'] }])
  })
})

describe('getCareGroupDisplayNumber', () => {
  it('liefert keine Nummer bei nur einer Gruppe', () => {
    expect(getCareGroupDisplayNumber('g1', ['g1'])).toBeNull()
  })

  it('vergibt stabile Orientierungsnummern ab 1 bei mehreren Gruppen', () => {
    const groupIds = ['g2', 'g1', 'g3']
    expect(getCareGroupDisplayNumber('g1', groupIds)).toBe(1)
    expect(getCareGroupDisplayNumber('g2', groupIds)).toBe(2)
    expect(getCareGroupDisplayNumber('g3', groupIds)).toBe(3)
  })
})

describe('connect selection', () => {
  it('erlaubt Verbinden ab zwei ungruppierten Flächen', () => {
    expect(canStartConnectMode(2)).toBe(true)
    expect(canStartConnectMode(1)).toBe(false)
    expect(canSubmitConnectSelection(['a1', 'a2'])).toBe(true)
    expect(canSubmitConnectSelection(['a1'])).toBe(false)
  })

  it('lehnt bereits gruppierte Flächen ab', () => {
    const memberships = [
      { careGroupId: 'g1', areaId: 'a1' },
      { careGroupId: 'g1', areaId: 'a2' },
    ]

    expect(isAreaEligibleForConnect('a1', memberships)).toBe(false)
    expect(isAreaEligibleForConnect('a3', memberships)).toBe(true)
  })

  it('validiert die Auswahl gegen ungruppierte Flächen', () => {
    expect(validateConnectSelection(['a1', 'a2'], ['a1', 'a2', 'a3'])).toBe(true)
    expect(validateConnectSelection(['a1', 'a2'], ['a2', 'a3'])).toBe(false)
  })
})

describe('layout', () => {
  it('trennt gruppierte und ungruppierte Flächen', () => {
    const layout = buildManageAreasLayout([areaA, areaB, areaC], [
      { careGroupId: 'g1', areaId: 'a1' },
      { careGroupId: 'g1', areaId: 'a2' },
    ])

    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0]?.areas.map((area) => area.id)).toEqual(['a1', 'a2'])
    expect(layout.ungroupedAreas.map((area) => area.id)).toEqual(['a3'])
    expect(getUngroupedAreaIds([areaA, areaB, areaC], [
      { careGroupId: 'g1', areaId: 'a1' },
      { careGroupId: 'g1', areaId: 'a2' },
    ])).toEqual(['a3'])
  })

  it('liefert keine Gruppen-ID für Einzelzuordnungen', () => {
    expect(getCareGroupIdForArea('a1', [{ careGroupId: 'g1', areaId: 'a1' }])).toBeNull()
  })
})

describe('Entkoppeln und Auflösen (Layout)', () => {
  it('simuliert Entfernen einer Fläche aus einer Dreiergruppe', () => {
    const memberships = [
      { careGroupId: 'g1', areaId: 'a1' },
      { careGroupId: 'g1', areaId: 'a2' },
      { careGroupId: 'g1', areaId: 'a3' },
    ]

    const afterDisconnect = memberships.filter((entry) => entry.areaId !== 'a2')
    const layout = buildManageAreasLayout([areaA, areaB, areaC], afterDisconnect)

    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0]?.areas.map((area) => area.id)).toEqual(['a1', 'a3'])
    expect(layout.ungroupedAreas.map((area) => area.id)).toEqual(['a2'])
  })

  it('simuliert Auflösung einer Zweiergruppe nach Entkoppeln', () => {
    const memberships = [
      { careGroupId: 'g1', areaId: 'a1' },
      { careGroupId: 'g1', areaId: 'a2' },
    ]

    const afterDisconnect = memberships.filter((entry) => entry.areaId !== 'a1')
    const layout = buildManageAreasLayout([areaA, areaB], afterDisconnect)

    expect(layout.groups).toHaveLength(0)
    expect(layout.ungroupedAreas.map((area) => area.id)).toEqual(['a1', 'a2'])
  })

  it('simuliert vollständige Aufhebung einer Verbindung', () => {
    const layout = buildManageAreasLayout([areaA, areaB, areaC], [])

    expect(layout.groups).toHaveLength(0)
    expect(layout.ungroupedAreas.map((area) => area.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('simuliert Löschen einer gruppierten Fläche ohne andere zu entfernen', () => {
    const memberships = [
      { careGroupId: 'g1', areaId: 'a1' },
      { careGroupId: 'g1', areaId: 'a2' },
    ]

    const remainingAreas = [areaB]
    const afterDeleteMemberships = memberships.filter((entry) => entry.areaId !== 'a1')
    const layout = buildManageAreasLayout(remainingAreas, afterDeleteMemberships)

    expect(layout.groups).toHaveLength(0)
    expect(layout.ungroupedAreas.map((area) => area.id)).toEqual(['a2'])
  })
})
