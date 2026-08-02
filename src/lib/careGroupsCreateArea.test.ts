import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

import { createAreaWithCareAssignment } from './careGroups'

describe('createAreaWithCareAssignment runtime contract', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockRpc.mockReset()
  })

  it('calls create_area_with_care_assignment for a separate area', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'area-new', name: 'Vorgarten', size_sqm: 120 },
      error: null,
    })

    await expect(
      createAreaWithCareAssignment({
        name: '  Vorgarten ',
        sizeSqm: 120,
        joinCareGroupId: null,
        joinAreaId: null,
      }),
    ).resolves.toEqual({
      id: 'area-new',
      name: 'Vorgarten',
      sizeSqm: 120,
    })

    expect(mockRpc).toHaveBeenCalledWith('create_area_with_care_assignment', {
      p_name: 'Vorgarten',
      p_size_sqm: 120,
      p_join_care_group_id: null,
      p_join_area_id: null,
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('calls create_area_with_care_assignment for an existing care group', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'area-new', name: 'Terrasse', size_sqm: 40 },
      error: null,
    })

    await createAreaWithCareAssignment({
      name: 'Terrasse',
      sizeSqm: 40,
      joinCareGroupId: 'group-1',
      joinAreaId: null,
    })

    expect(mockRpc).toHaveBeenCalledWith('create_area_with_care_assignment', {
      p_name: 'Terrasse',
      p_size_sqm: 40,
      p_join_care_group_id: 'group-1',
      p_join_area_id: null,
    })
  })

  it('calls create_area_with_care_assignment for pair formation', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'area-new', name: 'Seite', size_sqm: null },
      error: null,
    })

    await createAreaWithCareAssignment({
      name: 'Seite',
      sizeSqm: null,
      joinCareGroupId: null,
      joinAreaId: 'area-2',
    })

    expect(mockRpc).toHaveBeenCalledWith('create_area_with_care_assignment', {
      p_name: 'Seite',
      p_size_sqm: null,
      p_join_care_group_id: null,
      p_join_area_id: 'area-2',
    })
  })

  it('maps known server errors to user-facing messages', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'EMPTY_AREA_NAME: name required' },
    })

    await expect(
      createAreaWithCareAssignment({
        name: ' ',
        sizeSqm: 10,
      }),
    ).rejects.toThrow('Bitte gib einen Namen für die Rasenfläche ein.')
  })

  it('maps INVALID_CARE_TARGET to a controlled error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'INVALID_CARE_TARGET: both targets set' },
    })

    await expect(
      createAreaWithCareAssignment({
        name: 'Vorgarten',
        sizeSqm: 10,
        joinCareGroupId: 'group-1',
        joinAreaId: 'area-2',
      }),
    ).rejects.toThrow('Die Auswahl ist ungültig. Bitte versuche es erneut.')
  })

  it('uses the create-area fallback for unknown server errors', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'unexpected failure' },
    })

    await expect(
      createAreaWithCareAssignment({
        name: 'Vorgarten',
        sizeSqm: 10,
      }),
    ).rejects.toThrow(
      'Die Rasenfläche konnte nicht vollständig angelegt werden. Bitte versuche es erneut.',
    )
  })

  it('rejects invalid success payloads', async () => {
    mockRpc.mockResolvedValue({ data: { name: 'Vorgarten' }, error: null })

    await expect(
      createAreaWithCareAssignment({
        name: 'Vorgarten',
        sizeSqm: 10,
      }),
    ).rejects.toThrow(
      'Die Rasenfläche konnte nicht vollständig angelegt werden. Bitte versuche es erneut.',
    )
  })

  it('does not expose raw supabase errors', async () => {
    const rawError = { message: 'EMPTY_AREA_NAME', code: 'P0001' }
    mockRpc.mockResolvedValue({ data: null, error: rawError })

    await expect(
      createAreaWithCareAssignment({
        name: 'Vorgarten',
        sizeSqm: 10,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBe(rawError)
      return true
    })
  })

  it('uses only the standard supabase client boundary', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'area-new', name: 'Vorgarten', size_sqm: 10 },
      error: null,
    })

    await createAreaWithCareAssignment({
      name: 'Vorgarten',
      sizeSqm: 10,
    })

    expect(mockFrom).not.toHaveBeenCalled()
    const { supabase } = await import('./supabase')
    expect(Object.keys(supabase)).toEqual(['from', 'rpc'])
  })
})
