import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProductRecognizeClientError,
  PRODUCT_RECOGNIZE_CLIENT_DEFAULT_TIMEOUT_MS,
  recognizeProductFromImage,
} from './productRecognizeClient'

describe('recognizeProductFromImage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('verwendet standardmäßig einen 90-Sekunden-Timeout', () => {
    expect(PRODUCT_RECOGNIZE_CLIENT_DEFAULT_TIMEOUT_MS).toBe(90_000)
  })

  it('sendet den Erkennungsrequest mit Bilddaten', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        status: 'identified',
        identityConfidence: 1,
        dataCompleteness: 0.5,
        recognition: {},
        catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
        stockCapture: {
          allowed: true,
          recognitionCandidate: true,
          persistToCatalog: false,
          message: 'ok',
        },
        sources: [],
        missingRequiredFields: [],
        nextAction: { type: 'none', message: null },
        diagnostics: { model: 'test', latencyMs: 1, estimatedCost: null, warnings: [] },
        steps: [],
        spike: true,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await recognizeProductFromImage({
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      fileName: 'front.jpg',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/.netlify/functions/product-recognize',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: 'abc',
          mimeType: 'image/jpeg',
          fileName: 'front.jpg',
        }),
      }),
    )
  })

  it('behandelt nicht erreichbare Dienste bei HTML/404-Antworten', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )

    await expect(
      recognizeProductFromImage({
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({
      kind: 'unreachable',
      statusCode: 404,
    } satisfies Partial<ProductRecognizeClientError>)
  })

  it('behandelt fehlende Konfiguration mit 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'OPENAI_API_KEY ist nicht konfiguriert.' },
          { status: 503 },
        ),
      ),
    )

    await expect(
      recognizeProductFromImage({
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({
      kind: 'not_configured',
      statusCode: 503,
    } satisfies Partial<ProductRecognizeClientError>)
  })

  it('behandelt ungültige JSON-Antworten', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>error</html>', { status: 500 })),
    )

    await expect(
      recognizeProductFromImage({
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({
      kind: 'invalid_response',
      statusCode: 500,
    } satisfies Partial<ProductRecognizeClientError>)
  })

  it('behandelt Zeitüberschreitungen nach konfiguriertem Timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
      ),
    )

    const promise = recognizeProductFromImage({
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      timeoutMs: 90_000,
    })

    const expectation = expect(promise).rejects.toMatchObject({
      kind: 'timeout',
    } satisfies Partial<ProductRecognizeClientError>)

    await vi.advanceTimersByTimeAsync(90_000)
    await expectation
  })

  it('räumt den Timeout-Timer nach Erfolg auf', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          status: 'identified',
          identityConfidence: 1,
          dataCompleteness: 0.5,
          recognition: {},
          catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
          stockCapture: {
            allowed: true,
            recognitionCandidate: true,
            persistToCatalog: false,
            message: 'ok',
          },
          sources: [],
          missingRequiredFields: [],
          nextAction: { type: 'none', message: null },
          diagnostics: { model: 'test', latencyMs: 1, estimatedCost: null, warnings: [] },
          steps: [],
          spike: true,
        }),
      ),
    )

    await recognizeProductFromImage({
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
    })

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('räumt den Timeout-Timer nach HTTP-Fehler auf', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'OPENAI_API_KEY ist nicht konfiguriert.' },
          { status: 503 },
        ),
      ),
    )

    await expect(
      recognizeProductFromImage({
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({
      kind: 'not_configured',
    })

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('loggt Fetch-Outcome ohne Base64-Daten', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          status: 'error',
          identityConfidence: 0,
          dataCompleteness: 0,
          recognition: {},
          catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
          stockCapture: {
            allowed: false,
            recognitionCandidate: true,
            persistToCatalog: false,
            message: null,
          },
          sources: [],
          missingRequiredFields: ['image'],
          nextAction: { type: 'none', message: null },
          diagnostics: { model: 'test', latencyMs: 1, estimatedCost: null, warnings: ['x'] },
          steps: [],
          spike: true,
        }),
      ),
    )

    await recognizeProductFromImage({
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
    })

    const fetchOutcome = infoSpy.mock.calls.find(
      (call) => (call[1] as { stage?: string }).stage === 'fetch_outcome',
    )?.[1] as Record<string, unknown>

    expect(fetchOutcome?.timedOut).toBe(false)
    expect(fetchOutcome?.httpStatus).toBe(200)
    expect(JSON.stringify(fetchOutcome)).not.toContain('imageBase64')
  })
})
