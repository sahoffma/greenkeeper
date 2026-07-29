import { describe, expect, it } from 'vitest'
import { createRandomId, isPathSafeRandomId } from './randomId'

describe('createRandomId', () => {
  it('uses crypto.randomUUID when available', () => {
    const id = createRandomId({
      randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    })

    expect(id).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(isPathSafeRandomId(id)).toBe(true)
  })

  it('falls back to getRandomValues when randomUUID is missing', () => {
    let callCount = 0

    const id = createRandomId({
      getRandomValues: (array) => {
        callCount += 1
        array.fill(0xab)
        return array
      },
    })

    expect(callCount).toBe(1)
    expect(id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(isPathSafeRandomId(id)).toBe(true)
  })

  it('uses timestamp and random fallback when crypto helpers are unavailable', () => {
    const id = createRandomId({})

    expect(id.length).toBeGreaterThan(0)
    expect(isPathSafeRandomId(id)).toBe(true)
  })

  it('never returns an empty id', () => {
    expect(createRandomId({})).not.toBe('')
    expect(createRandomId({ randomUUID: () => 'abc-def' })).toBe('abc-def')
  })
})
