import { FERTILIZER_CAPTURE_FIXTURE_PRODUCTS } from '../data/fertilizerCaptureFixtures'
import {
  applyPackageClarification,
  buildCaptureSummary,
  buildPackageClarifyPrompt,
  createHomeResolvedHandoffDraft,
  createInitialCaptureDraft,
  proceedToConfirm,
  resolveRelativePackageChoice,
} from './fertilizerCaptureCore'
import { FERTILIZER_ROUTES } from './fertilizerRoutes'

const FIXTURE_ALL_SEASON = FERTILIZER_CAPTURE_FIXTURE_PRODUCTS.find(
  (product) => product.id === 'fixture-icl-all-season',
)

export type HomeFertilizerPurchasePhase = 'none' | 'clarify-package' | 'ready'

export function detectFixtureFertilizerPurchase(transcript: string): boolean {
  const normalized = transcript.trim().toLowerCase()

  if (!normalized.includes('all season')) {
    return false
  }

  return (
    normalized.includes('gekauft') ||
    normalized.includes('sack') ||
    normalized.includes('neu') ||
    normalized.includes('habe einen')
  )
}

export function homeFertilizerClarifyMessage(): string {
  if (!FIXTURE_ALL_SEASON) {
    return 'Waren es 7 kg oder 25 kg?'
  }

  const { options } = buildPackageClarifyPrompt(FIXTURE_ALL_SEASON)
  return `Ich habe ICL All Season erkannt. Waren es ${options.join(' oder ')}? Mit der Gebindegröße kann Greenkeeper Deinen aktuellen Bestand korrekt führen.`
}

export function resolveHomeFertilizerPackageAnswer(
  answer: string,
): { quantity: number; unit: 'kg' | 'l' } | null {
  if (!FIXTURE_ALL_SEASON) {
    return null
  }

  const resolved = resolveRelativePackageChoice(FIXTURE_ALL_SEASON, answer)
  if (!resolved) {
    return null
  }

  return { quantity: resolved.quantity, unit: resolved.unit }
}

export function buildHomeFertilizerReadySummary(answer: string) {
  const resolved = resolveHomeFertilizerPackageAnswer(answer)
  if (!resolved || !FIXTURE_ALL_SEASON) {
    return null
  }

  const { draft } = applyPackageClarification(
    {
      ...createInitialCaptureDraft(),
      step: 'clarify-package',
      selectedProduct: FIXTURE_ALL_SEASON,
    },
    answer,
  )

  return buildCaptureSummary(proceedToConfirm(draft))
}

export function homeFertilizerCapturePath(resolved: boolean): string {
  const query = resolved ? 'handoff=home-resolved' : 'handoff=home-all-season'
  return `${FERTILIZER_ROUTES.capture}?${query}`
}

export function homeResolvedHandoffHasSummary(): boolean {
  return buildCaptureSummary(createHomeResolvedHandoffDraft()) != null
}
