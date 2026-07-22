import type {
  ProductAssistantAnalyzeRequest,
  ProductAssistantInputChannel,
  ProductLearnSourceType,
} from '../types/productAssistant'
import { mapLearnSourceToInputChannel } from '../types/productAssistant'

export interface ProductLearnCaptureState {
  sourceType: ProductLearnSourceType
  photos: Array<{ dataUrl: string; mimeType: string }>
  sourceUrl: string
  pdf: { dataUrl: string; mimeType: string } | null
}

export function createEmptyCaptureState(sourceType: ProductLearnSourceType): ProductLearnCaptureState {
  return {
    sourceType,
    photos: [],
    sourceUrl: '',
    pdf: null,
  }
}

export function buildAnalyzeRequestFromCapture(
  capture: ProductLearnCaptureState,
  context: {
    spokenProductName: string
    spokenTranscript?: string
    manufacturer?: string
    officialName?: string
  },
): ProductAssistantAnalyzeRequest {
  const base: ProductAssistantAnalyzeRequest = {
    spokenProductName: context.spokenProductName,
    spokenTranscript: context.spokenTranscript,
    sourceType: capture.sourceType,
    manufacturer: context.manufacturer,
    officialName: context.officialName,
  }

  switch (capture.sourceType) {
    case 'photos':
      return {
        ...base,
        images: capture.photos.map((photo) => ({
          base64: photo.dataUrl,
          mimeType: photo.mimeType,
        })),
        imageBase64: capture.photos[0]?.dataUrl,
        mimeType: capture.photos[0]?.mimeType,
      }
    case 'manufacturer_url':
    case 'shop_url':
      return {
        ...base,
        sourceUrl: capture.sourceUrl.trim(),
      }
    case 'pdf':
      return {
        ...base,
        pdfBase64: capture.pdf?.dataUrl,
        pdfMimeType: capture.pdf?.mimeType,
      }
  }
}

export function validateCaptureState(capture: ProductLearnCaptureState): string | null {
  switch (capture.sourceType) {
    case 'photos':
      if (capture.photos.length === 0) {
        return 'Bitte lade mindestens ein Foto der Verpackung hoch.'
      }
      return null
    case 'manufacturer_url':
    case 'shop_url': {
      const url = capture.sourceUrl.trim()
      if (!url) {
        return 'Bitte füge einen Link ein.'
      }
      try {
        const parsed = new URL(url)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return 'Bitte verwende einen gültigen http- oder https-Link.'
        }
      } catch {
        return 'Bitte gib einen gültigen Link ein.'
      }
      return null
    }
    case 'pdf':
      if (!capture.pdf) {
        return 'Bitte lade ein Produktdatenblatt oder PDF hoch.'
      }
      return null
  }
}

export function resolveInputChannel(capture: ProductLearnCaptureState): ProductAssistantInputChannel {
  return mapLearnSourceToInputChannel(capture.sourceType)
}

export function buildSubmissionSources(
  capture: ProductLearnCaptureState,
  sourceDescription?: string | null,
): Array<{
  sourceType: string
  sourceName: string
  sourceUrl?: string | null
  retrievedAt: string
  evidence?: string | null
}> {
  const retrievedAt = new Date().toISOString()

  switch (capture.sourceType) {
    case 'photos':
      return [
        {
          sourceType: 'user_photo',
          sourceName: sourceDescription ?? 'Verpackungsfotos',
          retrievedAt,
          evidence: `${capture.photos.length} Foto(s)`,
        },
      ]
    case 'manufacturer_url':
      return [
        {
          sourceType: 'manufacturer_website',
          sourceName: 'Herstellerseite',
          sourceUrl: capture.sourceUrl.trim(),
          retrievedAt,
          evidence: sourceDescription,
        },
      ]
    case 'shop_url':
      return [
        {
          sourceType: 'retailer_page',
          sourceName: 'Shop-Link',
          sourceUrl: capture.sourceUrl.trim(),
          retrievedAt,
          evidence: sourceDescription,
        },
      ]
    case 'pdf':
      return [
        {
          sourceType: 'other',
          sourceName: 'Produktdatenblatt (PDF)',
          retrievedAt,
          evidence: sourceDescription,
        },
      ]
  }
}

export const LEARN_SOURCE_OPTIONS: Array<{
  type: ProductLearnSourceType
  icon: string
  title: string
  description: string
}> = [
  {
    type: 'photos',
    icon: '📷',
    title: 'Fotos der Verpackung',
    description:
      'Fotografiere die Vorder- und Rückseite oder alle relevanten Seiten der Verpackung.',
  },
  {
    type: 'manufacturer_url',
    icon: '🔗',
    title: 'Link zur Herstellerseite',
    description: 'Füge den Link zur offiziellen Produktseite des Herstellers ein.',
  },
  {
    type: 'shop_url',
    icon: '🛒',
    title: 'Link zu einem Shop',
    description: 'Füge den Link zu dem Shop ein, bei dem du das Produkt gefunden oder gekauft hast.',
  },
  {
    type: 'pdf',
    icon: '📄',
    title: 'Produktdatenblatt oder PDF hochladen',
    description: 'Lade das technische Datenblatt oder eine Produktbroschüre hoch.',
  },
]
