export type LawnCarePreference = 'together' | 'separate'

export const MIN_LAWN_COUNT = 1
export const MIN_MULTIPLE_LAWN_COUNT = 2
export const MAX_MULTIPLE_LAWN_COUNT = 20
export const MIN_CUSTOM_MULTIPLE_LAWN_COUNT = 4

export const MULTIPLE_LAWN_COUNT_VALIDATION_MESSAGE =
  'Bitte gib eine Zahl zwischen 4 und 20 ein.'

export const ONBOARDING_ROUTES = {
  lawnAreas: '/onboarding/2',
  multipleCare: '/onboarding/2/care',
  legacyMultipleCount: '/onboarding/2/count',
  step3: '/onboarding/3',
  step4: '/onboarding/4',
} as const

export interface MultipleLawnAreaDraft {
  name: string
  sizeSqm: number | null
}

export function buildLawnCountStepUrl(count?: number): string {
  if (count === undefined) {
    return ONBOARDING_ROUTES.lawnAreas
  }

  return `${ONBOARDING_ROUTES.lawnAreas}?count=${count}`
}

export function buildSingleAreaSizeStepUrl(): string {
  return `${ONBOARDING_ROUTES.step3}?areas=single&count=1`
}

export function buildMultipleCareStepUrl(count: number, care?: LawnCarePreference): string {
  const params = new URLSearchParams({ count: String(count) })

  if (care) {
    params.set('care', care)
  }

  return `${ONBOARDING_ROUTES.multipleCare}?${params.toString()}`
}

export function buildLawnAreaName(index: number): string {
  return `Rasenfläche ${index}`
}

export function buildDefaultLawnNames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => buildLawnAreaName(index + 1))
}

export function parseOnboardingLawnCount(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null
  }

  const count = Number(value)

  if (!Number.isInteger(count) || count < MIN_LAWN_COUNT || count > MAX_MULTIPLE_LAWN_COUNT) {
    return null
  }

  return count
}

export function parseMultipleLawnCount(value: string | null): number | null {
  const count = parseOnboardingLawnCount(value)

  if (count === null || count < MIN_MULTIPLE_LAWN_COUNT) {
    return null
  }

  return count
}

export function isSingleLawnCount(count: number): boolean {
  return count === MIN_LAWN_COUNT
}

export function isValidCustomMultipleLawnCount(value: string): boolean {
  const trimmed = value.trim()

  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return false
  }

  const count = Number(trimmed)

  return (
    Number.isInteger(count) &&
    count >= MIN_CUSTOM_MULTIPLE_LAWN_COUNT &&
    count <= MAX_MULTIPLE_LAWN_COUNT
  )
}

export function isValidAreaSize(value: string): boolean {
  const trimmed = value.trim()

  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return false
  }

  return Number(trimmed) > 0
}

export function parseLawnAreaCount(value: string | null): 'single' | 'multiple' | null {
  if (value === 'single') {
    return 'single'
  }

  if (value === 'multiple') {
    return 'multiple'
  }

  return null
}

export function parseLawnCarePreference(value: string | null): LawnCarePreference | null {
  if (value === 'together' || value === 'separate') {
    return value
  }

  return null
}

export function parseMultipleLawnIndex(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null
  }

  const index = Number(value)

  if (!Number.isInteger(index) || index < 1) {
    return null
  }

  return index
}

export function readMultipleLawnNames(searchParams: URLSearchParams, count: number): string[] {
  const names = buildDefaultLawnNames(count)

  for (let index = 1; index <= count; index += 1) {
    const name = searchParams.get(`name${index}`)?.trim()

    if (name) {
      names[index - 1] = name
    }
  }

  return names
}

export function readMultipleLawnSizes(searchParams: URLSearchParams, count: number): Array<number | null> {
  const sizes: Array<number | null> = Array.from({ length: count }, () => null)

  for (let index = 1; index <= count; index += 1) {
    const rawSize = searchParams.get(`size${index}`)

    if (rawSize && isValidAreaSize(rawSize)) {
      sizes[index - 1] = Number(rawSize.trim())
    }
  }

  return sizes
}

export function buildMultipleLawnSearchParams(input: {
  care: LawnCarePreference
  count: number
  names: string[]
  sizes: Array<number | null>
  index?: number
}): URLSearchParams {
  const params = new URLSearchParams({
    areas: 'multiple',
    care: input.care,
    count: String(input.count),
  })

  if (input.index !== undefined) {
    params.set('index', String(input.index))
  }

  for (let lawnIndex = 1; lawnIndex <= input.count; lawnIndex += 1) {
    params.set(`name${lawnIndex}`, input.names[lawnIndex - 1] ?? buildLawnAreaName(lawnIndex))

    const size = input.sizes[lawnIndex - 1]

    if (size !== null && size !== undefined) {
      params.set(`size${lawnIndex}`, String(size))
    }
  }

  return params
}

export function buildMultipleSizeStepUrl(input: {
  care: LawnCarePreference
  count: number
  names: string[]
  sizes: Array<number | null>
  index: number
}): string {
  const params = buildMultipleLawnSearchParams(input)
  return `${ONBOARDING_ROUTES.step3}?${params.toString()}`
}

export function buildMultipleSummaryStepUrl(input: {
  care: LawnCarePreference
  count: number
  names: string[]
  sizes: Array<number | null>
}): string {
  const params = buildMultipleLawnSearchParams(input)
  return `${ONBOARDING_ROUTES.step4}?${params.toString()}`
}

export function getMultipleSizeHeadline(index: number): string {
  return `Wie groß ist deine Rasenfläche ${index}?`
}

export function getMultipleSizeProgressLabel(_lawnIndex: number, count: number, name: string): string {
  return `${name} von ${count}`
}

export function buildMultipleLawnDrafts(input: {
  count: number
  names: string[]
  sizes: Array<number | null>
}): MultipleLawnAreaDraft[] {
  return Array.from({ length: input.count }, (_, index) => ({
    name: input.names[index] ?? buildLawnAreaName(index + 1),
    sizeSqm: input.sizes[index] ?? null,
  }))
}

export function buildCareSelectionNavigation(
  preference: LawnCarePreference,
  count: number,
): {
  careStepUrl: string
  nextStepUrl: string
} {
  return {
    careStepUrl: buildMultipleCareStepUrl(count, preference),
    nextStepUrl: buildMultipleSizeStepUrl({
      care: preference,
      count,
      names: buildDefaultLawnNames(count),
      sizes: Array.from({ length: count }, () => null),
      index: 1,
    }),
  }
}

export function resolveMultipleSizeNavigation(input: {
  care: LawnCarePreference
  count: number
  names: string[]
  sizes: Array<number | null>
  index: number
  nextSize: number | null
}): string {
  const sizes = [...input.sizes]
  sizes[input.index - 1] = input.nextSize

  if (input.index < input.count) {
    return buildMultipleSizeStepUrl({
      care: input.care,
      count: input.count,
      names: input.names,
      sizes,
      index: input.index + 1,
    })
  }

  return buildMultipleSummaryStepUrl({
    care: input.care,
    count: input.count,
    names: input.names,
    sizes,
  })
}

export function resolveMultipleSizeBackUrl(input: {
  care: LawnCarePreference
  count: number
  names: string[]
  sizes: Array<number | null>
  index: number
}): string {
  if (input.index <= 1) {
    return buildMultipleCareStepUrl(input.count, input.care)
  }

  return buildMultipleSizeStepUrl({
    care: input.care,
    count: input.count,
    names: input.names,
    sizes: input.sizes,
    index: input.index - 1,
  })
}

export function resolveLegacyCountRoute(searchParams: URLSearchParams): string {
  const care = parseLawnCarePreference(searchParams.get('care'))
  const count = parseOnboardingLawnCount(searchParams.get('count'))

  if (count === 1) {
    return buildSingleAreaSizeStepUrl()
  }

  if (count !== null && count >= MIN_MULTIPLE_LAWN_COUNT) {
    if (care) {
      return buildMultipleCareStepUrl(count, care)
    }

    return buildLawnCountStepUrl(count)
  }

  return ONBOARDING_ROUTES.lawnAreas
}
