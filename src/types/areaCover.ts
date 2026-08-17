/**
 * Reserved metadata for the future in-app crop editor.
 * Once cropping is implemented, the stored cover file should already match
 * AREA_COVER_ASPECT_RATIO; crop data is mainly useful for re-editing previews.
 */
export interface AreaCoverCrop {
  focalX: number
  focalY: number
  scale: number
}

export interface AreaCoverImageSource {
  url: string | null
  crop?: AreaCoverCrop | null
}

export type AreaCoverPlaceholderVariant = 'main' | 'side'
