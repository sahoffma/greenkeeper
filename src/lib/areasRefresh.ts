type AreasChangedListener = () => void

const listeners = new Set<AreasChangedListener>()

export function subscribeAreasChanged(listener: AreasChangedListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyAreasChanged(): void {
  listeners.forEach((listener) => {
    listener()
  })
}
