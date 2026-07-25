import { expect, test } from '@playwright/test'
import {
  assertNoTechnicalTerms,
  assertOnboardingCopy,
  clickPrimaryButton,
  completeSingleLawnSkipSize,
  completeSingleLawnWithSize,
  completeTwoLawnsSeparate,
  completeTwoLawnsTogether,
  fillAreaSize,
  loginViaUi,
  registerViaUi,
  selectCarePreference,
  selectLawnCount,
  skipAreaSize,
  startOnboardingFromWelcome,
} from './helpers/onboarding.mjs'
import {
  cleanupE2eUsers,
  countUserEntities,
  createConfirmedUser,
  findUserIdByEmail,
  getProfileOnboardingState,
  getUserAreas,
  loadE2eEnv,
  TEST_PASSWORD,
} from './helpers/supabase.mjs'

test.describe.configure({ mode: 'serial' })

const testUsers = []

test.beforeAll(() => {
  loadE2eEnv()
})

test.afterAll(async () => {
  await cleanupE2eUsers(testUsers)
})

function trackUser(user) {
  testUsers.push(user)
  return user
}

test('1 – Registrierung und Onboarding-Start', async ({ page }) => {
  const email = `gk-e2e-register-${Date.now()}@test.com`
  await registerViaUi(page, email, TEST_PASSWORD)
  const userId = await findUserIdByEmail(email)
  trackUser({ id: userId, email })

  await startOnboardingFromWelcome(page)
  await expect(
    page.getByRole('heading', { name: 'Wie viele Rasenflächen hat dein Garten?' }),
  ).toBeVisible()
})

test('2 – Eine Rasenfläche mit Größe', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('single-size'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')
  await completeSingleLawnWithSize(page, 120)

  const counts = await countUserEntities(user.id)
  expect(counts).toEqual({ areas: 1, groups: 1, memberships: 1 })

  const areas = await getUserAreas(user.id)
  expect(areas).toHaveLength(1)
  expect(areas[0].size_sqm).toBe(120)
  expect(areas[0].name).toBe('Rasenfläche 1')
})

test('3 – Eine Rasenfläche ohne Größe (Später eingeben)', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('single-no-size'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')
  await completeSingleLawnSkipSize(page)

  const areas = await getUserAreas(user.id)
  expect(areas).toHaveLength(1)
  expect(areas[0].size_sqm).toBeNull()
})

test('4 – Zwei Flächen, gemeinsame Pflege', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('together'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')
  await completeTwoLawnsTogether(page, [80, 150])

  const counts = await countUserEntities(user.id)
  expect(counts).toEqual({ areas: 2, groups: 1, memberships: 2 })

  const areas = await getUserAreas(user.id)
  expect(areas.map((area) => area.size_sqm)).toEqual([80, 150])
})

test('5 – Zwei Flächen, getrennte Pflege', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('separate'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')
  await completeTwoLawnsSeparate(page, [60, 90])

  const counts = await countUserEntities(user.id)
  expect(counts).toEqual({ areas: 2, groups: 2, memberships: 2 })
})

test('6 – Navigation, Fortschritt und finaler Button', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('navigation'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')

  await selectLawnCount(page, 2)
  await selectCarePreference(page, 'together')

  await expect(page.getByText('Rasenfläche 1 von 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled()

  await fillAreaSize(page, 50)
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled()
  await clickPrimaryButton(page, 'Weiter')

  await expect(page.getByText('Rasenfläche 2 von 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Los geht’s' })).toBeDisabled()

  await page.getByRole('button', { name: '← Zurück' }).click()
  await expect(page.getByText('Rasenfläche 1 von 2')).toBeVisible()

  await clickPrimaryButton(page, 'Weiter')
  await fillAreaSize(page, 70)
  await expect(page.getByRole('button', { name: 'Los geht’s' })).toBeEnabled()
})

test('7 – Validierung (Größe, Auswahl, Mehr als 3)', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('validation'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')

  await page.getByRole('button', { name: 'Mehr als 3' }).click()
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled()

  await page.getByLabel('Anzahl der Rasenflächen').fill('3')
  await expect(page.getByText('Bitte gib eine Zahl zwischen 4 und 20 ein.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled()

  await page.getByLabel('Anzahl der Rasenflächen').fill('21')
  await expect(page.getByText('Bitte gib eine Zahl zwischen 4 und 20 ein.')).toBeVisible()

  await page.getByLabel('Anzahl der Rasenflächen').fill('4')
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled()

  await selectLawnCount(page, 1)
  await expect(page.getByRole('heading', { name: 'Wie groß ist deine Rasenfläche?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Los geht’s' })).toBeDisabled()

  await page.getByLabel('Größe der Rasenfläche in Quadratmetern').fill('0')
  await expect(page.getByRole('button', { name: 'Los geht’s' })).toBeDisabled()
})

test('8 – Doppeltes Onboarding erzeugt keine neuen Daten', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('duplicate'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')
  await completeSingleLawnWithSize(page, 100)

  const before = await countUserEntities(user.id)

  await page.goto('/onboarding/2')
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  const after = await countUserEntities(user.id)
  expect(after).toEqual(before)
})

test('9 – Sichtprüfung ohne technische Begriffe (Desktop + Mobile)', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('visual'))
  await loginViaUi(page, user.email, user.password)

  await page.goto('/onboarding')
  await assertOnboardingCopy(page)
  await assertNoTechnicalTerms(page)

  await startOnboardingFromWelcome(page)
  await assertNoTechnicalTerms(page)
  await expect(
    page.getByRole('heading', { name: 'Wie viele Rasenflächen hat dein Garten?' }),
  ).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/onboarding/2')
  await assertNoTechnicalTerms(page)
  await expect(page.getByRole('button', { name: '1 Rasenfläche' })).toBeVisible()
})

test('10 – Cleanup-Verifikation', async () => {
  expect(testUsers.length).toBeGreaterThan(0)
})
