import { describe, expect, it } from 'vitest'
import {
  AREA_COVER_JPEG_QUALITY,
  AREA_COVER_MAX_EDGE_PX,
  AREA_COVER_UNSUPPORTED_FORMAT_MESSAGE,
  AREA_COVER_UPLOAD_ERROR_MESSAGE,
  buildAreaCoverStoragePath,
  calculateCoverDimensions,
  isSupportedCoverInputType,
  validateAreaCoverStoragePath,
} from './areaCoverImageCore'

describe('areaCoverImageCore', () => {
  const userId = '11111111-1111-4111-8111-111111111111'
  const areaId = '22222222-2222-4222-8222-222222222222'

  it('accepts supported image mime types', () => {
    expect(isSupportedCoverInputType('image/jpeg')).toBe(true)
    expect(isSupportedCoverInputType('image/png')).toBe(true)
    expect(isSupportedCoverInputType('image/webp')).toBe(true)
    expect(isSupportedCoverInputType('image/heic')).toBe(true)
  })

  it('rejects unsupported image mime types', () => {
    expect(isSupportedCoverInputType('image/gif')).toBe(false)
    expect(isSupportedCoverInputType('application/pdf')).toBe(false)
  })

  it('builds stable storage paths under user and area folders', () => {
    const path = buildAreaCoverStoragePath(userId, areaId, '550e8400-e29b-41d4-a716-446655440000')

    expect(path).toBe(`${userId}/${areaId}/cover-550e8400-e29b-41d4-a716-446655440000.jpg`)
    expect(validateAreaCoverStoragePath(userId, areaId, path)).toBe(true)
  })

  it('works without crypto.randomUUID via injected fallback id', () => {
    const fallbackId = `${Date.now().toString(16)}-abc123-def456`
    const path = buildAreaCoverStoragePath(userId, areaId, fallbackId)

    expect(path.endsWith('.jpg')).toBe(true)
    expect(validateAreaCoverStoragePath(userId, areaId, path)).toBe(true)
  })

  it('uses a dedicated upload error message', () => {
    expect(AREA_COVER_UPLOAD_ERROR_MESSAGE).toBe(
      'Das Foto konnte nicht gespeichert werden. Bitte versuche es erneut.',
    )
  })

  it('rejects manipulated storage paths', () => {
    const ownPath = buildAreaCoverStoragePath(userId, areaId, '550e8400-e29b-41d4-a716-446655440000')
    const foreignUserPath = ownPath.replace(userId, '33333333-3333-4333-8333-333333333333')
    const foreignAreaPath = ownPath.replace(areaId, '44444444-4444-4444-8444-444444444444')

    expect(validateAreaCoverStoragePath(userId, areaId, foreignUserPath)).toBe(false)
    expect(validateAreaCoverStoragePath(userId, areaId, foreignAreaPath)).toBe(false)
    expect(validateAreaCoverStoragePath(userId, areaId, `${userId}/${areaId}/evil.jpg`)).toBe(false)
  })

  it('scales down images beyond the max edge while preserving aspect ratio', () => {
    expect(calculateCoverDimensions(4000, 2000)).toEqual({
      width: AREA_COVER_MAX_EDGE_PX,
      height: 1000,
    })
  })

  it('keeps smaller images unchanged', () => {
    expect(calculateCoverDimensions(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('uses project jpeg quality constant', () => {
    expect(AREA_COVER_JPEG_QUALITY).toBeCloseTo(0.82)
  })

  it('documents unsupported format message', () => {
    expect(AREA_COVER_UNSUPPORTED_FORMAT_MESSAGE).toContain('Bildformat')
  })
})
