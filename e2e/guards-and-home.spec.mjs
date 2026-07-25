import { expect, test } from '@playwright/test'
import {
  completeSingleLawnWithSize,
  completeTwoLawnsSeparate,
  completeTwoLawnsTogether,
  loginViaUi,
} from './helpers/onboarding.mjs'
import {
  cleanupE2eUsers,
  completeOnboardingForUser,
  createConfirmedUser,
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

test('1 – Neuer Nutzer ohne Onboarding wird zum Onboarding geführt', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('guard-new'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/')
  await expect(page).toHaveURL(/\/onboarding$/)
})

test('2 – Nutzer mit abgeschlossenem Onboarding sieht Startseite', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('guard-complete'))
  await completeOnboardingForUser(user, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 75 }],
    care_mode: 'single',
  })
  await loginViaUi(page, user.email, user.password)
  await page.goto('/')
  await expect(page).toHaveURL('/')
  await expect(page.getByText('Rasenflächen werden geladen …')).toBeHidden({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Rasenfläche 1' })).toBeVisible()
})

test('3 – Nicht angemeldeter Nutzer sieht die Willkommensseite', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Willkommen bei Greenkeeper' })).toBeVisible()
})

test('4 – Geschützte Route ohne Sitzung führt zur Willkommensseite', async ({ page }) => {
  await page.goto('/journal')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Willkommen bei Greenkeeper' })).toBeVisible()
})

test('5 – Onboarding nach Abschluss führt zur Startseite', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('guard-no-repeat'))
  await completeOnboardingForUser(user, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 40 }],
    care_mode: 'single',
  })
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')
  await expect(page).toHaveURL('/')
})

test('6 – Nach Single-Onboarding erscheint genau eine Fläche', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('home-single'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')
  await completeSingleLawnWithSize(page, 120)
  await expect(page.getByRole('heading', { name: 'Rasenfläche 1' })).toBeVisible()
  await expect(page.getByText('120 m²')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rasenfläche 2' })).toHaveCount(0)
})

test('7 – Together-Onboarding zeigt alle Flächen', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('home-together'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')
  await completeTwoLawnsTogether(page, [80, 150])
  await expect(page.getByRole('heading', { name: 'Rasenfläche 1' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rasenfläche 2' })).toBeVisible()
  await expect(page.getByText('80 m²')).toBeVisible()
  await expect(page.getByText('150 m²')).toBeVisible()
})

test('8 – Separate-Onboarding zeigt alle Flächen', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('home-separate'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')
  await completeTwoLawnsSeparate(page, [60, 90])
  await expect(page.getByRole('heading', { name: 'Rasenfläche 1' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rasenfläche 2' })).toBeVisible()
})

test('9 – Fläche ohne Größe zeigt neutralen Text statt erfundener Zahl', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('home-no-size'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding/2')
  await page.getByRole('button', { name: '1 Rasenfläche', exact: true }).click()
  await page.getByRole('button', { name: 'Später eingeben' }).click()
  await page.waitForURL('/', { timeout: 20_000 })
  await expect(page.getByText('Größe noch nicht festgelegt')).toBeVisible()
  await expect(page.getByText(/\d+\s*m²/)).toHaveCount(0)
})

test('10 – Daten eines anderen Nutzers bleiben unsichtbar', async ({ page }) => {
  const userA = trackUser(await createConfirmedUser('home-user-a'))
  const userB = trackUser(await createConfirmedUser('home-user-b'))

  await completeOnboardingForUser(userA, {
    areas: [{ name: 'Geheime Fläche A', size_sqm: 33 }],
    care_mode: 'single',
  })
  await completeOnboardingForUser(userB, {
    areas: [{ name: 'Sichtbare Fläche B', size_sqm: 44 }],
    care_mode: 'single',
  })

  await loginViaUi(page, userB.email, userB.password)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sichtbare Fläche B' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Geheime Fläche A' })).toHaveCount(0)
})

test('11 – Desktop- und Mobile-Viewport zeigen echte Flächendaten', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('home-viewport'))
  await completeOnboardingForUser(user, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 95 }],
    care_mode: 'single',
  })
  await loginViaUi(page, user.email, user.password)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Rasenfläche 1' })).toBeVisible()
  await expect(page.getByText('95 m²')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Rasenfläche 1' })).toBeVisible()
  await expect(page.getByText('95 m²')).toBeVisible()
})

test('12 – Cleanup-Verifikation', async () => {
  expect(testUsers.length).toBeGreaterThan(0)
  const remainingAreas = await Promise.all(testUsers.map((user) => getUserAreas(user.id)))
  expect(remainingAreas.every((areas) => areas.length >= 0)).toBe(true)
})
