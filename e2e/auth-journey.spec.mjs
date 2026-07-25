import { expect, test } from '@playwright/test'
import { loginViaUi, registerViaUi } from './helpers/onboarding.mjs'
import {
  cleanupAllGkE2eUsers,
  cleanupE2eUsers,
  completeOnboardingForUser,
  countE2eUsersOnDev,
  createConfirmedUser,
  createUnconfirmedUser,
  createUserWithCredentials,
  findUserIdByEmail,
  generateRecoveryLink,
  generateSignupLink,
  loadE2eEnv,
  randomE2eEmail,
  TEST_PASSWORD,
} from './helpers/supabase.mjs'

test.describe.configure({ mode: 'serial' })

const testUsers = []

test.beforeAll(() => {
  loadE2eEnv()
})

test.afterAll(async () => {
  await cleanupE2eUsers(testUsers)
  await cleanupAllGkE2eUsers()
})

function trackUser(user) {
  testUsers.push(user)
  return user
}

test('1 – Willkommensseite führt zur Registrierung', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Rasen einrichten' }).click()
  await expect(page).toHaveURL('/register')
})

test('2 – Willkommensseite führt zum Login', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL('/login')
})

test('3 – Registrierung mit ungültiger E-Mail', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('E-Mail-Adresse').fill('keine-email')
  await page.getByLabel('Passwort', { exact: true }).fill(TEST_PASSWORD)
  await page.getByLabel('Passwort bestätigen').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Konto erstellen' }).click()
  await expect(page.getByText('Bitte gib eine gültige E-Mail-Adresse ein.')).toBeVisible()
})

test('4 – Registrierung mit nicht übereinstimmenden Passwörtern', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('E-Mail-Adresse').fill(randomE2eEmail('mismatch'))
  await page.getByLabel('Passwort', { exact: true }).fill(TEST_PASSWORD)
  await page.getByLabel('Passwort bestätigen').fill('AnderesPasswort1!')
  await page.getByRole('button', { name: 'Konto erstellen' }).click()
  await expect(page.getByText('Die Passwörter stimmen nicht überein.')).toBeVisible()
})

test('5 – Erfolgreiche Registrierung', async ({ page }) => {
  const email = randomE2eEmail('signup-success')
  await registerViaUi(page, email, TEST_PASSWORD)
  await expect(page).toHaveURL(/\/(onboarding|$)/)
  trackUser({ id: await findUserIdByEmail(email), email, password: TEST_PASSWORD })
})

test('6 – E-Mail-Bestätigungsseite nach Registrierung', async ({ page }) => {
  const email = randomE2eEmail('confirm-page')
  trackUser(await createUnconfirmedUser(email, TEST_PASSWORD))
  await page.goto(`/email-bestaetigen?email=${encodeURIComponent(email)}`)
  await expect(page.getByRole('heading', { name: 'Bestätige deine E-Mail-Adresse' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByText('Spam-Ordner')).toBeVisible()
})

test('7 – E-Mail erneut senden', async ({ page }) => {
  const email = randomE2eEmail('confirm-resend')
  trackUser(await createUnconfirmedUser(email, TEST_PASSWORD))
  await page.goto(`/email-bestaetigen?email=${encodeURIComponent(email)}`)
  await page.getByRole('button', { name: 'E-Mail erneut senden' }).click()
  await expect(
    page.getByText(/Wir haben dir erneut eine Bestätigungs-E-Mail geschickt\.|Zu viele Versuche/),
  ).toBeVisible({ timeout: 10_000 })
})

test('8 – Rückkehr über gültigen Bestätigungslink', async ({ page }) => {
  const email = randomE2eEmail('confirm-link')
  trackUser(await createUnconfirmedUser(email, TEST_PASSWORD))
  const link = await generateSignupLink(email)
  await page.goto(link)
  await page.waitForURL(/\/(onboarding|email-bestaetigen|$)/, { timeout: 20_000 })
})

test('9 – Login mit falschen Zugangsdaten', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('login-fail'))
  await page.goto('/login')
  await page.getByLabel('E-Mail-Adresse').fill(user.email)
  await page.getByLabel('Passwort').fill('FalschesPasswort123!')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByText('E-Mail oder Passwort ist falsch.')).toBeVisible()
})

test('10 – Login mit offenem Onboarding', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('login-open'))
  await loginViaUi(page, user.email, user.password)
  await expect(page).toHaveURL(/\/onboarding$/)
})

test('11 – Login mit abgeschlossenem Onboarding', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('login-done'))
  await completeOnboardingForUser(user, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 55 }],
    care_mode: 'single',
  })
  await loginViaUi(page, user.email, user.password)
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Rasenfläche 1' })).toBeVisible()
})

test('12 – Passwort-vergessen-Ablauf', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('forgot'))
  await page.goto('/passwort-vergessen')
  await page.getByLabel('E-Mail-Adresse').fill(user.email)
  await page.getByRole('button', { name: 'Link senden' }).click()
  await expect(
    page.getByText(
      /Wenn ein Konto mit dieser E-Mail-Adresse existiert|Zu viele Versuche/,
    ),
  ).toBeVisible({ timeout: 10_000 })
})

test('13 – Passwort-Zurücksetzen mit gültigem Link', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('reset-valid'))
  const link = await generateRecoveryLink(user.email)
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Neues Passwort festlegen' })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('textbox', { name: 'Neues Passwort' }).fill('NeuesPasswort123!')
  await page.getByRole('textbox', { name: 'Passwort bestätigen' }).fill('NeuesPasswort123!')
  await page.getByRole('button', { name: 'Passwort speichern' }).click()
  await page.waitForURL(/\/(login|onboarding|$)/, { timeout: 20_000 })
})

test('14 – Ungültiger Rücksetzlink', async ({ page }) => {
  await page.goto('/passwort-zuruecksetzen')
  await expect(page.getByRole('heading', { name: 'Link ungültig' })).toBeVisible()
})

test('15 – Direkte geschützte Route ohne Sitzung', async ({ page }) => {
  await page.goto('/journal')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Willkommen bei Greenkeeper' })).toBeVisible()
})

test('16 – Bestätigte Sitzung ohne Onboarding', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('confirmed-open'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/')
  await expect(page).toHaveURL(/\/onboarding$/)
})

test('17 – Bestätigte Sitzung mit abgeschlossenem Onboarding', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('confirmed-done'))
  await completeOnboardingForUser(user, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 80 }],
    care_mode: 'single',
  })
  await loginViaUi(page, user.email, user.password)
  await page.goto('/')
  await expect(page).toHaveURL('/')
})

test('18 – Keine Redirect-Schleife bei Browser-Reload', async ({ page }) => {
  const user = trackUser(await createConfirmedUser('reload'))
  await loginViaUi(page, user.email, user.password)
  await page.goto('/onboarding')
  await page.reload()
  await expect(page).toHaveURL(/\/onboarding$/)
  await page.reload()
  await expect(page).toHaveURL(/\/onboarding$/)
})

test('19 – Mobile-Viewport auf Willkommensseite', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Willkommen bei Greenkeeper' })).toBeVisible()
  await page.getByRole('button', { name: 'Rasen einrichten' }).click()
  await expect(page).toHaveURL('/register')
})

test('20 – Cleanup aller Testnutzer', async () => {
  await cleanupE2eUsers(testUsers)
  testUsers.splice(0, testUsers.length)
  expect(await countE2eUsersOnDev()).toBe(0)
})
