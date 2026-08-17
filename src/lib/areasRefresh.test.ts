import { describe, expect, it, vi } from 'vitest'
import { notifyAreasChanged, subscribeAreasChanged } from './areasRefresh'

describe('areasRefresh', () => {
  it('benachrichtigt Listener nach Gruppenänderungen', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeAreasChanged(listener)

    notifyAreasChanged()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    notifyAreasChanged()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
