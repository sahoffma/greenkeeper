import type { AreaCoverCrop, AreaCoverImageSource } from '../types/areaCover'
import type { Area } from '../types/area'

/** Project-wide cover aspect ratio (width : height). */
export const AREA_COVER_ASPECT_WIDTH = 5
export const AREA_COVER_ASPECT_HEIGHT = 3

export const AREA_COVER_ASPECT_RATIO = `${AREA_COVER_ASPECT_WIDTH} / ${AREA_COVER_ASPECT_HEIGHT}` as const

export function resolveAreaCoverImage(area: Area): AreaCoverImageSource {
  return {
    url: area.coverImageUrl ?? null,
    crop: null,
  }
}

export function coverImageObjectPosition(crop?: AreaCoverCrop | null): string {
  if (!crop) {
    return 'center center'
  }

  const x = Math.min(1, Math.max(0, crop.focalX))
  const y = Math.min(1, Math.max(0, crop.focalY))

  return `${x * 100}% ${y * 100}%`
}

export function coverImageObjectFit(crop?: AreaCoverCrop | null): 'cover' {
  void crop
  return 'cover'
}
