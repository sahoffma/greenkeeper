import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CREATION_DB_DEV_REF,
  isCreationDatabaseWriteTestsEnabled,
  loadCreationDatabaseTestConfig,
  resolveCreationDatabaseTestConfig,
} from './fertilizerInventoryCreationDatabaseTestHarness'

const DEV_SUPABASE_URL = `https://${CREATION_DB_DEV_REF}.supabase.co`
const PRODUCTION_SUPABASE_URL = 'https://keoxzyzdkvebedgdswah.supabase.co'

function validConnectionEnv(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    VITE_SUPABASE_URL: DEV_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_DB_PASSWORD: 'test-db-password',
    ...overrides,
  }
}

describe('fertilizerInventoryCreationDatabaseTestHarness security gate', () => {
  it('SG-1 ignores ALLOW_SUPABASE_WRITE_TESTS=true from env file when process flag is missing', () => {
    expect(
      resolveCreationDatabaseTestConfig(
        validConnectionEnv({ ALLOW_SUPABASE_WRITE_TESTS: 'true' }),
      )?.projectRef,
    ).toBe(CREATION_DB_DEV_REF)
    expect(isCreationDatabaseWriteTestsEnabled({})).toBe(false)
    expect(loadCreationDatabaseTestConfig()).toBeNull()
  })

  it('SG-2 rejects process flag false even when env file contains true', () => {
    expect(isCreationDatabaseWriteTestsEnabled({ ALLOW_SUPABASE_WRITE_TESTS: 'false' })).toBe(
      false,
    )
    expect(
      resolveCreationDatabaseTestConfig(
        validConnectionEnv({ ALLOW_SUPABASE_WRITE_TESTS: 'true' }),
      ),
    ).not.toBeNull()
    expect(
      isCreationDatabaseWriteTestsEnabled({
        ALLOW_SUPABASE_WRITE_TESTS: 'false',
      }),
    ).toBe(false)
  })

  it('SG-3 rejects uppercase TRUE process flag', () => {
    expect(isCreationDatabaseWriteTestsEnabled({ ALLOW_SUPABASE_WRITE_TESTS: 'TRUE' })).toBe(
      false,
    )
  })

  it('SG-4 rejects numeric 1 process flag', () => {
    expect(isCreationDatabaseWriteTestsEnabled({ ALLOW_SUPABASE_WRITE_TESTS: '1' })).toBe(false)
  })

  it('SG-5 loads config only with exact process flag true and valid dev connection data', () => {
    const config = resolveCreationDatabaseTestConfig(
      validConnectionEnv({ ALLOW_SUPABASE_WRITE_TESTS: 'true' }),
    )
    expect(config).not.toBeNull()
    expect(config?.projectRef).toBe(CREATION_DB_DEV_REF)
    expect(config?.supabaseUrl).toBe(DEV_SUPABASE_URL)
    expect(config?.anonKey).toBe('test-anon-key')
    expect(config?.serviceRoleKey).toBe('test-service-role-key')
    expect(config?.dbPassword).toBe('test-db-password')
  })

  it('SG-6 blocks production project ref even with exact process flag true', () => {
    expect(
      resolveCreationDatabaseTestConfig({
        VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        SUPABASE_DB_PASSWORD: 'test-db-password',
      }),
    ).toBeNull()
  })

  it('SG-7 returns null when required connection data is missing', () => {
    expect(
      resolveCreationDatabaseTestConfig({
        VITE_SUPABASE_URL: DEV_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: '',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        SUPABASE_DB_PASSWORD: 'test-db-password',
      }),
    ).toBeNull()
  })

  it('SG-8 never reads ALLOW_SUPABASE_WRITE_TESTS from env file values', () => {
    const withFileFlagOnly = resolveCreationDatabaseTestConfig({
      ALLOW_SUPABASE_WRITE_TESTS: 'true',
    })
    expect(withFileFlagOnly).toBeNull()
  })

  it('SG-9 does not expose secrets in null-config paths', () => {
    const secret = 'super-secret-service-role-key-value'
    const config = resolveCreationDatabaseTestConfig({
      VITE_SUPABASE_URL: DEV_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: secret,
      SUPABASE_DB_PASSWORD: '',
    })
    expect(config).toBeNull()
    expect(String(config)).not.toContain(secret)
  })

  it('SG-10 wrapper script does not assign ALLOW_SUPABASE_WRITE_TESTS itself', () => {
    const wrapperPath = resolve(
      process.cwd(),
      'scripts/verify-fertilizer-inventory-creation-database.mjs',
    )
    const source = readFileSync(wrapperPath, 'utf8')
    expect(source).not.toContain('process.env.ALLOW_SUPABASE_WRITE_TESTS =')
    expect(source).toContain("process.env.ALLOW_SUPABASE_WRITE_TESTS !== 'true'")
  })
})
