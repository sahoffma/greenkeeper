import { describe, expect, it } from 'vitest'
import {
  buildHomeGreeting,
  getTimeGreeting,
  resolveProfileDisplayName,
  resolveProfileFirstName,
} from './greeting'

describe('getTimeGreeting', () => {
  it('returns Guten Morgen in the morning', () => {
    expect(getTimeGreeting(new Date('2026-07-21T08:00:00'))).toBe('Guten Morgen')
  })

  it('returns Guten Tag during the day', () => {
    expect(getTimeGreeting(new Date('2026-07-21T14:00:00'))).toBe('Guten Tag')
  })

  it('returns Guten Abend in the evening', () => {
    expect(getTimeGreeting(new Date('2026-07-21T20:00:00'))).toBe('Guten Abend')
  })
})

describe('buildHomeGreeting', () => {
  it('uses first name when available', () => {
    expect(buildHomeGreeting('Sascha', new Date('2026-07-21T14:00:00'))).toBe('Guten Tag, Sascha.')
  })

  it('omits name when not available', () => {
    expect(buildHomeGreeting(null, new Date('2026-07-21T14:00:00'))).toBe('Guten Tag.')
  })
})

describe('resolveProfileDisplayName', () => {
  it('rejects email-like display names', () => {
    expect(resolveProfileDisplayName('user@example.com', 'user@example.com')).toBeNull()
  })

  it('accepts a real display name', () => {
    expect(resolveProfileDisplayName('Sascha', 'user@example.com')).toBe('Sascha')
  })

  it('rejects automated test display names', () => {
    expect(resolveProfileDisplayName('gk-e2e-home-test', 'user@test.com')).toBeNull()
  })
})

describe('resolveProfileFirstName', () => {
  it('returns only the first name', () => {
    expect(resolveProfileFirstName('Sascha Hoffmann', 'user@example.com')).toBe('Sascha')
  })

  it('rejects technical usernames', () => {
    expect(resolveProfileFirstName('sa.hoffma', 'user@example.com')).toBeNull()
  })

  it('rejects email-like names', () => {
    expect(resolveProfileFirstName('user@example.com', 'user@example.com')).toBeNull()
  })
})
