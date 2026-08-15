import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'

const LEGAL_SUFFIX_PATTERN =
  /\b(gmbh|ag|kg|co\.?\s*kg|ltd|inc|corp|corporation|limited|s\.?\s*a\.?|bv|oy|ab)\b/gi

export function normalizeResearchToken(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildProductNameSearchVariants(name: string | null | undefined): string[] {
  const trimmed = (name ?? '').trim()
  if (!trimmed) {
    return []
  }

  const variants = new Set<string>([trimmed])

  const hyphenCollapsed = trimmed.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim()
  variants.add(hyphenCollapsed)

  const hyphenated = trimmed.replace(/\s+/g, '-')
  variants.add(hyphenated)

  const spaceSeparated = trimmed.replace(/[-–—]/g, ' ')
  variants.add(spaceSeparated)

  const compact = trimmed.replace(/[^a-zA-Z0-9]/g, '')
  if (compact.length >= 3) {
    variants.add(compact)
  }

  return [...variants].filter(Boolean)
}

export function buildManufacturerBrandToken(manufacturer: string | null | undefined): string | null {
  const normalized = normalizeResearchToken(manufacturer)
  if (!normalized) {
    return null
  }

  const withoutLegalSuffix = normalized.replace(LEGAL_SUFFIX_PATTERN, ' ').replace(/\s+/g, ' ').trim()
  const token = withoutLegalSuffix.split(' ')[0]
  return token && token.length >= 3 ? token : null
}

function quoteExactSearchTerm(value: string): string {
  return value.includes(' ') ? `"${value}"` : value
}

export function buildManufacturerResearchSearchQueries(input: {
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  packageSizeLabel?: string | null
}): string[] {
  const manufacturer = input.identity.manufacturer?.trim() ?? ''
  const productLine = input.identity.productLine?.trim() ?? ''
  const officialName = input.identity.officialName?.trim() ?? ''
  const variant = input.identity.variant?.trim() ?? ''
  const npk = input.npkLabel?.trim() ?? variant.replace(/\s+/g, '')
  const packageSize = input.packageSizeLabel?.trim() ?? ''

  const productVariants = buildProductNameSearchVariants(officialName)
  const prioritized: string[] = []
  const broader = new Set<string>()
  const brandToken = buildManufacturerBrandToken(manufacturer)
  const exactProductName = officialName.trim()

  if (brandToken && productLine && exactProductName && npk) {
    prioritized.push(
      [`site:${brandToken}.de`, quoteExactSearchTerm(productLine), quoteExactSearchTerm(exactProductName), quoteExactSearchTerm(npk)]
        .filter(Boolean)
        .join(' ')
        .trim(),
    )
  }

  if (brandToken && exactProductName && npk) {
    prioritized.push(
      [`site:${brandToken}.de`, quoteExactSearchTerm(exactProductName), quoteExactSearchTerm(npk)]
        .filter(Boolean)
        .join(' ')
        .trim(),
    )
  }

  if (brandToken && productLine && exactProductName) {
    prioritized.push(
      [`site:${brandToken}.de`, quoteExactSearchTerm(productLine), quoteExactSearchTerm(exactProductName), 'Produktdatenblatt']
        .filter(Boolean)
        .join(' ')
        .trim(),
    )
  }

  if (manufacturer && productLine && exactProductName && npk) {
    prioritized.push(
      [manufacturer, productLine, quoteExactSearchTerm(exactProductName), quoteExactSearchTerm(npk)]
        .filter(Boolean)
        .join(' ')
        .trim(),
    )
  }

  for (const productVariant of productVariants) {
    broader.add([manufacturer, productLine, productVariant, npk, packageSize].filter(Boolean).join(' ').trim())
    broader.add([manufacturer, productLine, productVariant, 'Dünger', npk].filter(Boolean).join(' ').trim())
    broader.add([manufacturer, productLine, productVariant, 'Produktdatenblatt'].filter(Boolean).join(' ').trim())
    broader.add([manufacturer, productLine, productVariant, 'Datenblatt'].filter(Boolean).join(' ').trim())
    broader.add([manufacturer, productLine, productVariant, 'Zusammensetzung'].filter(Boolean).join(' ').trim())
    broader.add([manufacturer, productLine, productVariant, 'technical data'].filter(Boolean).join(' ').trim())
    broader.add([manufacturer, productLine, productVariant, 'NPK', npk].filter(Boolean).join(' ').trim())
  }

  if (brandToken) {
    for (const productVariant of productVariants) {
      broader.add(
        [`site:${brandToken}.de`, productLine, productVariant, 'Dünger', npk].filter(Boolean).join(' ').trim(),
      )
      broader.add(
        [`site:${brandToken}.de`, productLine, productVariant, npk].filter(Boolean).join(' ').trim(),
      )
      broader.add(
        [`site:${brandToken}.com`, productLine, productVariant, 'fertilizer', npk]
          .filter(Boolean)
          .join(' ')
          .trim(),
      )
    }
  }

  const dedupedPrioritized = [...new Set(prioritized.filter(Boolean))]
  const dedupedBroader = [...broader].filter(
    (query) => query.length > 0 && !dedupedPrioritized.includes(query),
  )

  return [...dedupedPrioritized, ...dedupedBroader]
}

export function slugifyResearchSegment(value: string | null | undefined): string | null {
  const normalized = normalizeResearchToken(value)
  if (!normalized) {
    return null
  }

  const slug = normalized.replace(/\s+/g, '-')
  return slug.length > 0 ? slug : null
}

export function buildOfficialSourceUrlCandidates(input: {
  identity: FertilizerEnrichmentIdentity
  manufacturerDomain: string | null
}): string[] {
  const domain = input.manufacturerDomain?.trim()
  if (!domain) {
    return []
  }

  const productSlugs = [
    ...buildProductNameSearchVariants(input.identity.officialName),
    ...buildProductNameSearchVariants(input.identity.variant),
  ]
    .map(slugifyResearchSegment)
    .filter((slug): slug is string => Boolean(slug))

  const lineSlug = slugifyResearchSegment(input.identity.productLine)
  const uniqueSlugs = [...new Set(productSlugs)]
  const hosts = [`https://www.${domain}`, `https://${domain}`]
  const paths = [
    'duenger',
    'produkte',
    'products',
    'product',
    'shop',
    'fertilizer',
    'duenger/professional',
    'produkte/professional',
  ]

  const candidates = new Set<string>()

  for (const host of hosts) {
    for (const slug of uniqueSlugs) {
      for (const path of paths) {
        candidates.add(`${host}/${path}/${slug}`)
        candidates.add(`${host}/${path}/${slug}.pdf`)
      }

      if (lineSlug) {
        candidates.add(`${host}/${lineSlug.toLowerCase()}/${slug}`)
        candidates.add(`${host}/${lineSlug.toLowerCase()}/${slug}.pdf`)
      }
    }
  }

  return [...candidates]
}
