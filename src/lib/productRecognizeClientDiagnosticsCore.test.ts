import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildRecognitionClientPreFetchDiagnostics,
  estimateRecognitionJsonPayloadBytes,
  logRecognitionClientPreFetch,
  recognitionClientDiagnosticsExcludeBase64,
} from './productRecognizeClientDiagnosticsCore'

describe('productRecognizeClientDiagnosticsCore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('schätzt JSON-Payload-Größe ohne Base64-Inhalt zu loggen', () => {
    const bytes = estimateRecognitionJsonPayloadBytes({
      imageBase64: 'abc123',
      mimeType: 'image/jpeg',
      fileName: 'front.jpg',
    })

    expect(bytes).toBeGreaterThan(20)
    expect(recognitionClientDiagnosticsExcludeBase64({
      fileName: 'front.jpg',
      base64Length: 6,
      estimatedJsonPayloadBytes: bytes,
    })).toBe(true)
  })

  it('loggt Pre-Fetch-Metadaten ohne Base64-Daten', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const diagnostics = buildRecognitionClientPreFetchDiagnostics({
      fileName: 'image.jpg',
      browserMimeType: 'image/jpeg',
      originalBytes: 2048,
      resolvedUploadMimeType: 'image/heic',
      base64Length: 12,
      imageBase64: 'Zm9vYmFyYmF6',
      encodeMs: 7,
      fetchStartedAt: '2026-08-05T09:13:00.000Z',
    })

    logRecognitionClientPreFetch(diagnostics)

    expect(infoSpy).toHaveBeenCalledOnce()
    const payload = infoSpy.mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload.stage).toBe('pre_fetch')
    expect(payload.fileName).toBe('image.jpg')
    expect(payload.resolvedUploadMimeType).toBe('image/heic')
    expect(JSON.stringify(payload)).not.toContain('Zm9v')
    expect(JSON.stringify(payload)).not.toContain('imageBase64')
  })
})
