export type TimeGreeting = 'Guten Morgen' | 'Guten Tag' | 'Guten Abend'

export function getTimeGreeting(date = new Date()): TimeGreeting {
  const hour = date.getHours()

  if (hour >= 5 && hour < 11) {
    return 'Guten Morgen'
  }

  if (hour >= 11 && hour < 18) {
    return 'Guten Tag'
  }

  return 'Guten Abend'
}

export function buildHomeGreeting(firstName: string | null | undefined, date = new Date()): string {
  const timeGreeting = getTimeGreeting(date)
  const trimmedName = firstName?.trim()

  if (trimmedName) {
    return `${timeGreeting}, ${trimmedName}.`
  }

  return `${timeGreeting}.`
}

export function resolveProfileDisplayName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const trimmed = displayName?.trim()

  if (!trimmed) {
    return null
  }

  if (email && trimmed.toLowerCase() === email.toLowerCase()) {
    return null
  }

  if (trimmed.includes('@')) {
    return null
  }

  if (/^gk-(e2e|verify)-/i.test(trimmed)) {
    return null
  }

  return trimmed
}

export function resolveProfileFirstName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const resolved = resolveProfileDisplayName(displayName, email)

  if (!resolved) {
    return null
  }

  const firstName = resolved.split(/\s+/)[0]?.trim()

  if (!firstName || /[._@]/.test(firstName)) {
    return null
  }

  return firstName
}
