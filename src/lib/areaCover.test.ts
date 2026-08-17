import { describe, expect, it } from 'vitest'
import { AREA_COVER_ASPECT_RATIO, coverImageObjectPosition, resolveAreaCoverImage } from './areaCover'
import type { Area } from '../types/area'

const sampleArea: Area = {
  id: 'area-1',
  name: 'Hauptrasen',
  subtitle: '',
  sizeLabel: '320 m²',
  status: 'observe',
  statusLabel: 'Entwicklung beobachten',
  summary: null,
}

describe('areaCover', () => {
  it('uses a single project-wide aspect ratio constant', () => {
    expect(AREA_COVER_ASPECT_RATIO).toBe('5 / 3')
  })

  it('returns cover url when area has a signed image', () => {
    expect(
      resolveAreaCoverImage({
        ...sampleArea,
        coverImageUrl: 'https://signed.example/cover.jpg',
      }),
    ).toEqual({
      url: 'https://signed.example/cover.jpg',
      crop: null,
    })
  })

  it('returns an empty cover source until uploads exist', () => {
    expect(resolveAreaCoverImage(sampleArea)).toEqual({
      url: null,
      crop: null,
    })
  })

  it('maps crop focal points to object-position', () => {
    expect(coverImageObjectPosition({ focalX: 0.5, focalY: 0.25, scale: 1 })).toBe('50% 25%')
    expect(coverImageObjectPosition(null)).toBe('center center')
  })
})
