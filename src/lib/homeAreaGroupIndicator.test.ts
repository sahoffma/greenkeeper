import { describe, expect, it } from 'vitest'
import { getCareGroupDisplayNumber, getCareGroupIdForArea } from '../lib/careGroupsCore'
import { shouldShowAreaGroupIndicator } from '../components/home/AreaGroupIndicator'

describe('Home Gruppenindikator', () => {
  const groupedMemberships = [
    { careGroupId: 'g1', areaId: 'a1' },
    { careGroupId: 'g1', areaId: 'a2' },
  ]

  it('zeigt einen Indikator für gruppierte Flächen', () => {
    expect(
      shouldShowAreaGroupIndicator('a1', groupedMemberships, getCareGroupIdForArea),
    ).toBe(true)
    expect(
      shouldShowAreaGroupIndicator('a2', groupedMemberships, getCareGroupIdForArea),
    ).toBe(true)
  })

  it('vergibt Gruppennummern nur bei mehreren Gruppen', () => {
    expect(getCareGroupDisplayNumber('g1', ['g1'])).toBeNull()
    expect(getCareGroupDisplayNumber('g2', ['g1', 'g2'])).toBe(2)
  })

  it('zeigt keinen Indikator für ungruppierte Flächen', () => {
    expect(
      shouldShowAreaGroupIndicator('a3', groupedMemberships, getCareGroupIdForArea),
    ).toBe(false)
    expect(
      shouldShowAreaGroupIndicator('a1', [], getCareGroupIdForArea),
    ).toBe(false)
  })
})
