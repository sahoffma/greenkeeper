import { describe, expect, it, vi } from 'vitest'
import { createFertilizerProductProfileSaveNetlifyHandler } from './fertilizerProductProfileSaveNetlifyFunctionCore'

describe('fertilizerProductProfileSaveNetlifyFunctionCore', () => {
  it('returns OPTIONS without invoking save handler', async () => {
    const handleSave = vi.fn()
    const handler = createFertilizerProductProfileSaveNetlifyHandler(() => ({
      handlers: { handleSave },
      isCompositionEnabled: () => true,
      environment: {} as never,
    }))

    const response = await handler(
      {
        httpMethod: 'OPTIONS',
        body: null,
        headers: {},
        path: '/.netlify/functions/fertilizer-product-profile-save',
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
        queryStringParameters: null,
        rawUrl: '',
        rawQuery: '',
        route: '',
      } as never,
      {} as never,
    )

    expect(response?.statusCode).toBe(204)
    expect(handleSave).not.toHaveBeenCalled()
  })

  it('delegates POST to runtime save handler', async () => {
    const handleSave = vi.fn(async () => ({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: { id: 'profile-1' }, reusedExistingVersion: false }),
    }))

    const handler = createFertilizerProductProfileSaveNetlifyHandler(() => ({
      handlers: { handleSave },
      isCompositionEnabled: () => true,
      environment: {} as never,
    }))

    const response = await handler(
      {
        httpMethod: 'POST',
        body: JSON.stringify({
          enrichmentJobId: 'job-1',
          userConfirmed: true,
          idempotencyKey: 'save-idem-1',
        }),
        headers: {},
        path: '/.netlify/functions/fertilizer-product-profile-save',
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
        queryStringParameters: null,
        rawUrl: '',
        rawQuery: '',
        route: '',
      } as never,
      {} as never,
    )

    expect(handleSave).toHaveBeenCalledTimes(1)
    expect(response?.statusCode).toBe(200)
    expect(response?.headers?.['Content-Type']).toBe('application/json')
  })
})
