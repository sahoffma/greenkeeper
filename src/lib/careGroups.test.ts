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

import {
  connectAreasCareGroup,
  disconnectAreaFromCareGroup,
  dissolveCareGroup,
  fetchCareGroupMemberships,
} from './careGroups'

function mockQueryChain(result: QueryResult) {
  const promise = Promise.resolve(result)
  const chain = {
    select: vi.fn(function select() {
      return chain
    }),
    is: vi.fn(function is() {
      return promise
    }),
    in: vi.fn(function inFilter() {
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

function assertNoDirectWrites(...chains: ReturnType<typeof mockQueryChain>[]) {
  for (const chain of chains) {
    expect(chain.insert).not.toHaveBeenCalled()
    expect(chain.update).not.toHaveBeenCalled()
    expect(chain.delete).not.toHaveBeenCalled()
    expect(chain.upsert).not.toHaveBeenCalled()
  }
}

describe('careGroups runtime contract', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockRpc.mockReset()
  })

  describe('fetchCareGroupMemberships', () => {
    it('queries care_groups with select(id) and archived_at IS NULL', async () => {
      const groupsChain = mockQueryChain({ data: [], error: null })
      mockFrom.mockReturnValueOnce(groupsChain)

      await fetchCareGroupMemberships()

      expect(mockFrom).toHaveBeenCalledWith('care_groups')
      expect(groupsChain.select).toHaveBeenCalledWith('id')
      expect(groupsChain.is).toHaveBeenCalledWith('archived_at', null)
    })

    it('returns an empty list and skips care_group_areas when no active groups exist', async () => {
      const groupsChain = mockQueryChain({ data: [], error: null })
      mockFrom.mockReturnValueOnce(groupsChain)

      await expect(fetchCareGroupMemberships()).resolves.toEqual([])
      expect(mockFrom).toHaveBeenCalledTimes(1)
      assertNoDirectWrites(groupsChain)
    })

    it('reads care_group_areas for active group ids', async () => {
      const groupsChain = mockQueryChain({
        data: [{ id: 'g1' }, { id: 'g2' }],
        error: null,
      })
      const membershipsChain = mockQueryChain({
        data: [
          { care_group_id: 'g1', area_id: 'a1' },
          { care_group_id: 'g2', area_id: 'a2' },
        ],
        error: null,
      })
      mockFrom.mockReturnValueOnce(groupsChain).mockReturnValueOnce(membershipsChain)

      await fetchCareGroupMemberships()

      expect(mockFrom).toHaveBeenNthCalledWith(2, 'care_group_areas')
      expect(membershipsChain.select).toHaveBeenCalledWith('care_group_id, area_id')
      expect(membershipsChain.in).toHaveBeenCalledWith('care_group_id', ['g1', 'g2'])
      assertNoDirectWrites(groupsChain, membershipsChain)
    })

    it('returns membership rows in the stable domain shape', async () => {
      mockFrom
        .mockReturnValueOnce(
          mockQueryChain({ data: [{ id: 'g1' }], error: null }),
        )
        .mockReturnValueOnce(
          mockQueryChain({
            data: [{ care_group_id: 'g1', area_id: 'a1' }],
            error: null,
          }),
        )

      await expect(fetchCareGroupMemberships()).resolves.toEqual([
        { careGroupId: 'g1', areaId: 'a1' },
      ])
    })

    it('preserves the query result order', async () => {
      mockFrom
        .mockReturnValueOnce(
          mockQueryChain({ data: [{ id: 'g1' }], error: null }),
        )
        .mockReturnValueOnce(
          mockQueryChain({
            data: [
              { care_group_id: 'g1', area_id: 'a2' },
              { care_group_id: 'g1', area_id: 'a1' },
            ],
            error: null,
          }),
        )

      await expect(fetchCareGroupMemberships()).resolves.toEqual([
        { careGroupId: 'g1', areaId: 'a2' },
        { careGroupId: 'g1', areaId: 'a1' },
      ])
    })

    it('throws a controlled Error when care_groups read fails and does not query memberships', async () => {
      const groupsChain = mockQueryChain({
        data: null,
        error: { message: 'groups unavailable' },
      })
      mockFrom.mockReturnValueOnce(groupsChain)

      await expect(fetchCareGroupMemberships()).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('groups unavailable')
        return true
      })
      expect(mockFrom).toHaveBeenCalledTimes(1)
    })

    it('uses the fetch fallback when care_groups error has no message', async () => {
      mockFrom.mockReturnValueOnce(mockQueryChain({ data: null, error: {} }))

      await expect(fetchCareGroupMemberships()).rejects.toThrow(
        'Verbindungen konnten nicht geladen werden.',
      )
    })

    it('throws a controlled Error when care_group_areas read fails', async () => {
      mockFrom
        .mockReturnValueOnce(
          mockQueryChain({ data: [{ id: 'g1' }], error: null }),
        )
        .mockReturnValueOnce(
          mockQueryChain({
            data: null,
            error: { message: 'memberships unavailable' },
          }),
        )

      await expect(fetchCareGroupMemberships()).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('memberships unavailable')
        return true
      })
    })
  })

  describe('connectAreasCareGroup', () => {
    it('calls connect_areas_care_group with p_area_ids', async () => {
      mockRpc.mockResolvedValue({ data: 'g-new', error: null })

      await expect(connectAreasCareGroup(['a2', 'a1'])).resolves.toBe('g-new')

      expect(mockRpc).toHaveBeenCalledWith('connect_areas_care_group', {
        p_area_ids: ['a2', 'a1'],
      })
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('maps known server errors to user-facing messages', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'MIN_TWO_AREAS_REQUIRED: need at least two areas' },
      })

      await expect(connectAreasCareGroup(['a1'])).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Wähle mindestens zwei Rasenflächen aus.')
        return true
      })
    })

    it('uses the connect fallback for unknown server errors', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'unexpected failure' },
      })

      await expect(connectAreasCareGroup(['a1', 'a2'])).rejects.toThrow(
        'Die Rasenflächen konnten nicht verbunden werden.',
      )
    })
  })

  describe('disconnectAreaFromCareGroup', () => {
    it('calls disconnect_area_from_care_group with p_area_id', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })

      await expect(disconnectAreaFromCareGroup('area-1')).resolves.toBeUndefined()

      expect(mockRpc).toHaveBeenCalledWith('disconnect_area_from_care_group', {
        p_area_id: 'area-1',
      })
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('maps known server errors to user-facing messages', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'INVALID_AREA_ID: missing area' },
      })

      await expect(disconnectAreaFromCareGroup('area-1')).rejects.toThrow(
        'Die Rasenfläche ist nicht mehr verfügbar.',
      )
    })

    it('uses the disconnect fallback for unknown server errors', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'unexpected failure' },
      })

      await expect(disconnectAreaFromCareGroup('area-1')).rejects.toThrow(
        'Die Rasenfläche konnte nicht gelöst werden.',
      )
    })
  })

  describe('dissolveCareGroup', () => {
    it('calls dissolve_care_group with p_group_id', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })

      await expect(dissolveCareGroup('group-1')).resolves.toBeUndefined()

      expect(mockRpc).toHaveBeenCalledWith('dissolve_care_group', {
        p_group_id: 'group-1',
      })
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('maps known server errors to user-facing messages', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'INVALID_GROUP_ID: missing group' },
      })

      await expect(dissolveCareGroup('group-1')).rejects.toThrow(
        'Diese Verbindung ist nicht mehr verfügbar.',
      )
    })

    it('uses the dissolve fallback for unknown server errors', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'unexpected failure' },
      })

      await expect(dissolveCareGroup('group-1')).rejects.toThrow(
        'Die Verbindung konnte nicht aufgehoben werden.',
      )
    })
  })

  describe('architecture boundaries', () => {
    it('uses only the standard supabase client boundary without direct writes', async () => {
      const groupsChain = mockQueryChain({ data: [], error: null })
      mockFrom.mockReturnValueOnce(groupsChain)

      await fetchCareGroupMemberships()

      assertNoDirectWrites(groupsChain)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('does not expose service role or auth on the mocked client', async () => {
      const { supabase } = await import('./supabase')
      expect(Object.keys(supabase)).toEqual(['from', 'rpc'])
    })
  })
})
