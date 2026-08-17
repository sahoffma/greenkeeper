import { describe, expect, it } from 'vitest'
import {
  appendTranscript,
  buildConfirmationRows,
  isParseEndpointUnavailable,
  mapSummaryLabel,
} from './homeVoiceFlow'

describe('appendTranscript', () => {
  it('appends transcript segments with a space', () => {
    expect(appendTranscript('Heute', 'gemäht')).toBe('Heute gemäht')
  })
})

describe('mapSummaryLabel', () => {
  it('maps Maßnahme to Tätigkeit', () => {
    expect(mapSummaryLabel('Maßnahme')).toBe('Tätigkeit')
  })
})

describe('buildConfirmationRows', () => {
  it('builds confirmation rows for parsed activities', () => {
    const rows = buildConfirmationRows(
      {
        activityType: 'mowing',
        activityLabel: 'Mähen',
        date: '2026-07-21',
        productName: null,
        amount: null,
        unit: null,
        mowHeightMm: null,
        note: null,
        confidence: 1,
        warnings: [],
      },
      'Hauptrasen',
    )

    expect(rows.some((row) => row.label === 'Tätigkeit' && row.value === 'Mähen')).toBe(true)
    expect(rows.some((row) => row.label === 'Fläche' && row.value === 'Hauptrasen')).toBe(true)
  })
})

describe('isParseEndpointUnavailable', () => {
  it('detects unavailable parse endpoints', () => {
    expect(isParseEndpointUnavailable(new Error('Die Auswertungs-Route ist nicht erreichbar.'))).toBe(
      true,
    )
    expect(isParseEndpointUnavailable(new Error('Unbekannter Fehler'))).toBe(false)
  })
})
