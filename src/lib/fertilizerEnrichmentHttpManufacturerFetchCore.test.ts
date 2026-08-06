import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchExternalManufacturerDocument } from './fertilizerEnrichmentHttpManufacturerFetchCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const BASE_URL = 'https://manufacturer.example/products/stress-manager'

function encodeBody(body: string): ArrayBuffer {
  return new TextEncoder().encode(body).buffer
}

function mockFetchResponse(options: {
  status?: number
  headers?: Record<string, string>
  body?: string | ArrayBuffer
  url?: string
}): Response {
  const status = options.status ?? 200
  const body =
    typeof options.body === 'string'
      ? encodeBody(options.body)
      : options.body ?? new ArrayBuffer(0)

  return {
    status,
    ok: status >= 200 && status < 300,
    url: options.url ?? BASE_URL,
    headers: {
      get: (name: string) => {
        const normalized = name.toLowerCase()
        const entry = Object.entries(options.headers ?? {}).find(
          ([key]) => key.toLowerCase() === normalized,
        )
        return entry?.[1] ?? null
      },
    },
    arrayBuffer: async () => body,
  } as Response
}

describe('fertilizerEnrichmentHttpManufacturerFetchCore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns stripped HTML text from a successful manufacturer page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          headers: { 'content-type': 'text/html; charset=utf-8' },
          body: `<html><body><h1>Stress-Manager</h1><p>NPK 0-0-30</p></body></html>`,
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument(BASE_URL, { now: () => FIXED_NOW })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toContain('Stress-Manager')
      expect(result.text).toContain('NPK 0-0-30')
      expect(result.contentType).toBe('text/plain')
      expect(result.retrievedAt).toBe(FIXED_NOW)
    }
  })

  it('returns plain text sources unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          body: 'Manufacturer: Example\nProduct: Granular Feed\nNPK 10-5-20',
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument(BASE_URL, { now: () => FIXED_NOW })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toBe('Manufacturer: Example\nProduct: Granular Feed\nNPK 10-5-20')
    }
  })

  it('extracts readable text from PDF responses when possible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          headers: { 'content-type': 'application/pdf' },
          body: '%PDF-1.4\nstream\n(Manufacturer: Example\nProduct: Granular Feed)\nendstream',
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument(BASE_URL)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.contentType).toBe('application/pdf')
      expect(result.text).toContain('Granular Feed')
    }
  })

  it('rejects PDF responses without extractable text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          headers: { 'content-type': 'application/pdf' },
          body: '%PDF-1.4 fake',
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument(BASE_URL)

    expect(result).toEqual({ ok: false, errorCode: 'unsupported_source', retryable: false })
  })

  it('maps HTTP 404 to source_not_found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          status: 404,
          body: 'missing',
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument(BASE_URL)

    expect(result).toEqual({ ok: false, errorCode: 'source_not_found', retryable: false })
  })

  it('maps HTTP 500 to retryable network_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          status: 500,
          body: 'server error',
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument(BASE_URL)

    expect(result).toEqual({ ok: false, errorCode: 'network_error', retryable: true })
  })

  it('maps request timeout to retryable timeout', async () => {
    vi.useFakeTimers()

    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
      ),
    )

    const promise = fetchExternalManufacturerDocument(BASE_URL, { timeoutMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    const result = await promise

    expect(result).toEqual({ ok: false, errorCode: 'timeout', retryable: true })
  })

  it('maps aborted requests to retryable timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
          queueMicrotask(() => init?.signal?.dispatchEvent(new Event('abort')))
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument(BASE_URL, { timeoutMs: 1 })

    expect(result).toEqual({ ok: false, errorCode: 'timeout', retryable: true })
  })

  it('rejects invalid URLs', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchExternalManufacturerDocument('not-a-valid-url')

    expect(result).toEqual({ ok: false, errorCode: 'unsupported_source', retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects disallowed protocols', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchExternalManufacturerDocument('ftp://files.example/doc.pdf')

    expect(result).toEqual({ ok: false, errorCode: 'unsupported_source', retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects empty responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          headers: { 'content-type': 'text/plain' },
          body: '',
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument(BASE_URL)

    expect(result).toEqual({ ok: false, errorCode: 'invalid_document', retryable: false })
  })

  it('rejects responses above the size limit', async () => {
    const oversized = new Uint8Array(2_000_001)
    oversized.fill(97)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          headers: { 'content-type': 'text/plain' },
          body: oversized.buffer,
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument(BASE_URL)

    expect(result).toEqual({ ok: false, errorCode: 'invalid_document', retryable: false })
  })

  it('follows redirects and reports the final URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          url: 'https://manufacturer.example/final/stress-manager',
          headers: { 'content-type': 'text/html' },
          body: '<html><body>Product: Stress-Manager</body></html>',
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument('https://manufacturer.example/start')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.finalUrl).toBe('https://manufacturer.example/final/stress-manager')
      expect(result.text).toContain('Stress-Manager')
    }
  })

  describe('redirect target validation', () => {
    const maliciousBody = 'SECRET-MUST-NOT-LEAK NPK 99-99-99'

    it('allows redirect from HTTPS source to valid HTTPS manufacturer page', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockFetchResponse({
            url: 'https://manufacturer.example/final/stress-manager',
            headers: { 'content-type': 'text/html' },
            body: '<html><body>Product: Stress-Manager</body></html>',
          }),
        ),
      )

      const result = await fetchExternalManufacturerDocument('https://manufacturer.example/start')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.finalUrl).toBe('https://manufacturer.example/final/stress-manager')
      }
    })

    it('rejects redirect to localhost', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockFetchResponse({
            url: 'https://localhost/private-doc',
            headers: { 'content-type': 'text/html' },
            body: maliciousBody,
          }),
        ),
      )

      const result = await fetchExternalManufacturerDocument(BASE_URL)

      expect(result).toEqual({ ok: false, errorCode: 'unsupported_source', retryable: false })
    })

    it('rejects redirect to private IP', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockFetchResponse({
            url: 'https://192.168.1.10/internal-doc',
            headers: { 'content-type': 'text/html' },
            body: maliciousBody,
          }),
        ),
      )

      const result = await fetchExternalManufacturerDocument(BASE_URL)

      expect(result).toEqual({ ok: false, errorCode: 'unsupported_source', retryable: false })
    })

    it('rejects redirect URL with embedded credentials', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockFetchResponse({
            url: 'https://user:pass@manufacturer.example/private-doc',
            headers: { 'content-type': 'text/html' },
            body: maliciousBody,
          }),
        ),
      )

      const result = await fetchExternalManufacturerDocument(BASE_URL)

      expect(result).toEqual({ ok: false, errorCode: 'unsupported_source', retryable: false })
    })

    it('rejects redirect to disallowed protocol', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockFetchResponse({
            url: 'ftp://manufacturer.example/private-doc',
            headers: { 'content-type': 'text/html' },
            body: maliciousBody,
          }),
        ),
      )

      const result = await fetchExternalManufacturerDocument(BASE_URL)

      expect(result).toEqual({ ok: false, errorCode: 'unsupported_source', retryable: false })
    })
  })

  it('does not treat script or style contents as product declaration text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          headers: { 'content-type': 'text/html' },
          body: `<html>
            <head>
              <style>.hidden { display: none; } .hidden:before { content: "NPK 99-99-99"; }</style>
              <script>const npk = "NPK 88-88-88"; document.write(npk);</script>
            </head>
            <body>
              <p>Product: Stress-Manager</p>
              <p>NPK 0-0-30</p>
            </body>
          </html>`,
        }),
      ),
    )

    const result = await fetchExternalManufacturerDocument(BASE_URL)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toContain('NPK 0-0-30')
      expect(result.text).not.toContain('88-88-88')
      expect(result.text).not.toContain('99-99-99')
    }
  })

  it('rejects storage locator references as unsupported_source', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchExternalManufacturerDocument('gk-storage:v1/user/doc-1')

    expect(result).toEqual({ ok: false, errorCode: 'unsupported_source', retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
