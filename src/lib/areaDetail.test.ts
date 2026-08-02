import { beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = { data: unknown; error: unknown }

const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

import { fetchAreaDetail, mapAreaDetailRow, updateAreaDetails } from './areaDetail'

function mockQueryChain(result: QueryResult) {
  const promise = Promise.resolve(result)
  const chain = {
    select: vi.fn(function select() {
      return chain
    }),
    eq: vi.fn(function eq() {
      return chain
    }),
    is: vi.fn(function is() {
      return chain
    }),
    maybeSingle: vi.fn(function maybeSingle() {
      return promise
    }),
    insert: vi.fn(function insert() {
      return chain
    }),
    update: vi.fn(function update() {
      return chain
    }),
    delete: vi.fn(function del() {
      return chain
    }),
    upsert: vi.fn(function upsert() {
      return chain
    }),
  }
  return chain
}

const areaId = '22222222-2222-4222-8222-222222222222'

describe('areaDetail runtime contract', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockRpc.mockReset()
  })

  describe('mapAreaDetailRow', () => {
    it('maps size_sqm and cover_image_path to the stable domain shape', () => {
      expect(
        mapAreaDetailRow({
          id: areaId,
          name: 'Hauptrasen',
          subtitle: null,
          size_sqm: 320,
          status: 'observe',
          status_label: null,
          summary: null,
          cover_image_path: 'user/area/cover-abc.jpg',
        }),
      ).toEqual(
        expect.objectContaining({
          id: areaId,
          name: 'Hauptrasen',
          sizeSqm: 320,
          sizeLabel: '320 m²',
          coverImagePath: 'user/area/cover-abc.jpg',
        }),
      )
    })

    it('supports cover_image_path = null', () => {
      expect(
        mapAreaDetailRow({
          id: areaId,
          name: 'Nebengarten',
          subtitle: null,
          size_sqm: null,
          status: 'observe',
          status_label: null,
          summary: null,
          cover_image_path: null,
        }).coverImagePath,
      ).toBeNull()
    })
  })

  describe('fetchAreaDetail', () => {
    it('queries areas with the expected select list and archived_at filter', async () => {
      const chain = mockQueryChain({
        data: {
          id: areaId,
          name: 'Hauptrasen',
          subtitle: null,
          size_sqm: 320,
          status: 'observe',
          status_label: null,
          summary: null,
          cover_image_path: null,
        },
        error: null,
      })
      mockFrom.mockReturnValueOnce(chain)

      await fetchAreaDetail(areaId)

      expect(mockFrom).toHaveBeenCalledWith('areas')
      expect(chain.select).toHaveBeenCalledWith(
        'id, name, subtitle, size_sqm, status, status_label, summary, cover_image_path',
      )
      expect(chain.eq).toHaveBeenCalledWith('id', areaId)
      expect(chain.is).toHaveBeenCalledWith('archived_at', null)
      expect(chain.maybeSingle).toHaveBeenCalled()
      expect(mockRpc).not.toHaveBeenCalled()
      expect(chain.insert).not.toHaveBeenCalled()
      expect(chain.update).not.toHaveBeenCalled()
      expect(chain.delete).not.toHaveBeenCalled()
      expect(chain.upsert).not.toHaveBeenCalled()
    })

    it('returns null when the area is missing or not visible', async () => {
      mockFrom.mockReturnValueOnce(mockQueryChain({ data: null, error: null }))

      await expect(fetchAreaDetail(areaId)).resolves.toBeNull()
    })

    it('throws a controlled error when the read fails', async () => {
      mockFrom.mockReturnValueOnce(
        mockQueryChain({ data: null, error: { message: 'read failed' } }),
      )

      await expect(fetchAreaDetail(areaId)).rejects.toThrow('read failed')
    })
  })

  describe('updateAreaDetails', () => {
    it('calls update_area_details with trimmed name and size', async () => {
      mockRpc.mockResolvedValue({
        data: {
          id: areaId,
          name: 'Neuer Name',
          size_sqm: 150,
          cover_image_path: 'user/area/cover-old.jpg',
        },
        error: null,
      })

      await expect(
        updateAreaDetails({
          areaId,
          name: '  Neuer Name  ',
          sizeSqm: 150,
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          id: areaId,
          name: 'Neuer Name',
          sizeSqm: 150,
          coverImagePath: 'user/area/cover-old.jpg',
        }),
      )

      expect(mockRpc).toHaveBeenCalledWith('update_area_details', {
        p_area_id: areaId,
        p_name: 'Neuer Name',
        p_size_sqm: 150,
      })
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('preserves the cover path returned by the RPC without sending cover changes', async () => {
      mockRpc.mockResolvedValue({
        data: {
          id: areaId,
          name: 'Hauptrasen',
          size_sqm: 200,
          cover_image_path: null,
        },
        error: null,
      })

      await expect(
        updateAreaDetails({
          areaId,
          name: 'Hauptrasen',
          sizeSqm: 200,
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          coverImagePath: null,
        }),
      )
    })

    it('maps EMPTY_AREA_NAME to a user-facing message', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'EMPTY_AREA_NAME: required' },
      })

      await expect(
        updateAreaDetails({ areaId, name: ' ', sizeSqm: 100 }),
      ).rejects.toThrow('Bitte gib einen Namen für die Rasenfläche ein.')
    })

    it('maps INVALID_AREA_SIZE to a user-facing message', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'INVALID_AREA_SIZE: bad size' },
      })

      await expect(
        updateAreaDetails({ areaId, name: 'Hauptrasen', sizeSqm: 0 }),
      ).rejects.toThrow('Bitte gib eine gültige Größe in m² ein.')
    })

    it('maps FOREIGN_OR_MISSING_AREA to a user-facing message', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'FOREIGN_OR_MISSING_AREA' },
      })

      await expect(
        updateAreaDetails({ areaId, name: 'Hauptrasen', sizeSqm: 100 }),
      ).rejects.toThrow('Diese Rasenfläche ist nicht mehr verfügbar.')
    })

    it('maps NOT_AUTHENTICATED to a user-facing message', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'NOT_AUTHENTICATED' },
      })

      await expect(
        updateAreaDetails({ areaId, name: 'Hauptrasen', sizeSqm: 100 }),
      ).rejects.toThrow('Bitte melde dich erneut an.')
    })

    it('uses the update fallback for unknown server errors', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'unexpected failure' },
      })

      await expect(
        updateAreaDetails({ areaId, name: 'Hauptrasen', sizeSqm: 100 }),
      ).rejects.toThrow('Die Änderungen konnten nicht gespeichert werden. Bitte versuche es erneut.')
    })

    it('rejects invalid RPC success payloads', async () => {
      mockRpc.mockResolvedValue({
        data: { name: 'Hauptrasen' },
        error: null,
      })

      await expect(
        updateAreaDetails({ areaId, name: 'Hauptrasen', sizeSqm: 100 }),
      ).rejects.toThrow('Die Änderungen konnten nicht gespeichert werden. Bitte versuche es erneut.')
    })

    it('does not expose raw supabase errors', async () => {
      const rawError = { message: 'EMPTY_AREA_NAME', code: 'P0001' }
      mockRpc.mockResolvedValue({ data: null, error: rawError })

      await expect(
        updateAreaDetails({ areaId, name: 'Hauptrasen', sizeSqm: 100 }),
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(Error)
        expect(error).not.toBe(rawError)
        return true
      })
    })
  })
})
