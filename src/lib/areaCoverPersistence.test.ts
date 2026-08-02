import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRpc = vi.fn()
const mockStorageFrom = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    storage: {
      from: (...args: unknown[]) => mockStorageFrom(...args),
    },
  },
}))

import {
  commitAreaCoverImage,
  createSignedCoverUrl,
  removeAreaCoverImage,
  uploadAreaCoverImage,
} from './areaCoverPersistence'

const userId = '11111111-1111-4111-8111-111111111111'
const areaId = '22222222-2222-4222-8222-222222222222'

describe('areaCoverPersistence runtime contract', () => {
  beforeEach(() => {
    mockRpc.mockReset()
    mockStorageFrom.mockReset()
  })

  describe('uploadAreaCoverImage', () => {
    it('uploads to the lawn-images bucket under a validated path', async () => {
      const upload = vi.fn().mockResolvedValue({ error: null })
      mockStorageFrom.mockReturnValue({ upload })

      const path = await uploadAreaCoverImage({
        userId,
        areaId,
        file: new Blob(['jpeg'], { type: 'image/jpeg' }),
      })

      expect(path).toMatch(new RegExp(`^${userId}/${areaId}/cover-.+\\.jpg$`))
      expect(mockStorageFrom).toHaveBeenCalledWith('lawn-images')
      expect(upload).toHaveBeenCalledWith(path, expect.any(Blob), {
        contentType: 'image/jpeg',
        upsert: false,
      })
      expect(mockRpc).not.toHaveBeenCalled()
    })
  })

  describe('commitAreaCoverImage', () => {
    it('calls set_area_cover_image with the cover path', async () => {
      mockRpc.mockResolvedValue({
        data: {
          cover_image_path: `${userId}/${areaId}/cover-new.jpg`,
          old_cover_image_path: null,
        },
        error: null,
      })

      await expect(
        commitAreaCoverImage({
          areaId,
          coverImagePath: `${userId}/${areaId}/cover-new.jpg`,
        }),
      ).resolves.toEqual({
        coverImagePath: `${userId}/${areaId}/cover-new.jpg`,
        oldCoverImagePath: null,
      })

      expect(mockRpc).toHaveBeenCalledWith('set_area_cover_image', {
        p_area_id: areaId,
        p_cover_image_path: `${userId}/${areaId}/cover-new.jpg`,
      })
      expect(mockStorageFrom).not.toHaveBeenCalled()
    })

    it('returns the previous cover path when replacing an image', async () => {
      const oldPath = `${userId}/${areaId}/cover-old.jpg`
      const newPath = `${userId}/${areaId}/cover-new.jpg`

      mockRpc.mockResolvedValue({
        data: {
          cover_image_path: newPath,
          old_cover_image_path: oldPath,
        },
        error: null,
      })

      await expect(
        commitAreaCoverImage({
          areaId,
          coverImagePath: newPath,
        }),
      ).resolves.toEqual({
        coverImagePath: newPath,
        oldCoverImagePath: oldPath,
      })
    })

    it('maps known server errors to user-facing messages', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'INVALID_COVER_PATH: bad path' },
      })

      await expect(
        commitAreaCoverImage({
          areaId,
          coverImagePath: `${userId}/${areaId}/cover-new.jpg`,
        }),
      ).rejects.toThrow('Das Foto konnte nicht gespeichert werden. Bitte versuche es erneut.')
    })

    it('uses the upload fallback for unknown server errors', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'unexpected failure' },
      })

      await expect(
        commitAreaCoverImage({
          areaId,
          coverImagePath: `${userId}/${areaId}/cover-new.jpg`,
        }),
      ).rejects.toThrow('Das Foto konnte nicht gespeichert werden. Bitte versuche es erneut.')
    })

    it('rejects invalid success payloads', async () => {
      mockRpc.mockResolvedValue({ data: { old_cover_image_path: null }, error: null })

      await expect(
        commitAreaCoverImage({
          areaId,
          coverImagePath: `${userId}/${areaId}/cover-new.jpg`,
        }),
      ).rejects.toThrow('Das Foto konnte nicht gespeichert werden. Bitte versuche es erneut.')
    })
  })

  describe('removeAreaCoverImage', () => {
    it('calls remove_area_cover_image and returns the old path', async () => {
      const oldPath = `${userId}/${areaId}/cover-old.jpg`
      mockRpc.mockResolvedValue({
        data: { old_cover_image_path: oldPath },
        error: null,
      })

      await expect(removeAreaCoverImage(areaId)).resolves.toBe(oldPath)

      expect(mockRpc).toHaveBeenCalledWith('remove_area_cover_image', {
        p_area_id: areaId,
      })
    })

    it('maps foreign area errors to a controlled message', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'FOREIGN_OR_MISSING_AREA' },
      })

      await expect(removeAreaCoverImage(areaId)).rejects.toThrow(
        'Diese Rasenfläche ist nicht mehr verfügbar.',
      )
    })
  })

  describe('createSignedCoverUrl', () => {
    it('returns null for missing paths without calling storage', async () => {
      await expect(createSignedCoverUrl(null)).resolves.toBeNull()
      expect(mockStorageFrom).not.toHaveBeenCalled()
    })

    it('creates a signed url for an existing storage path', async () => {
      const createSignedUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://signed.example/cover.jpg' },
        error: null,
      })
      mockStorageFrom.mockReturnValue({ createSignedUrl })

      await expect(createSignedCoverUrl(`${userId}/${areaId}/cover-old.jpg`)).resolves.toBe(
        'https://signed.example/cover.jpg',
      )
    })
  })
})
