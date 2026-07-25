import { expect } from '@playwright/test'
import { confirmUserEmail, createUserWithCredentials } from './supabase.mjs'

const FORBIDDEN_UI_TERMS = [
  'care_group',
  'care_groups',
  'complete_onboarding',
  'onboarding_completed_at',
  'size_sqm',
  'rpc',
  'supabase',
]

export async function registerViaUi(page, email, password) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Jetzt registrieren' }).click()
  await expect(page.getByRole('heading', { name: 'Neues Konto' })).toBeVisible()
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort').fill(password)
  await page.getByRole('button', { name: 'Registrieren' }).click()

  const navigatedHome = await page
    .waitForURL('/', { timeout: 8_000 })
    .then(() => true)
    .catch(() => false)

  if (navigatedHome) {
    return { via: 'signup' }
  }

  const confirmationMessage = page.getByText('Bitte bestätige deine E-Mail-Adresse.')
  if (await confirmationMessage.isVisible().catch(() => false)) {
    await confirmUserEmail(email)
    await loginViaUi(page, email, password)
    return { via: 'signup-confirm' }
  }

  const errorText = await page.locator('[class*="error"]').first().textContent().catch(() => null)

  if (
    errorText &&
    (errorText.includes('rate limit') ||
      errorText.includes('invalid') ||
      errorText.includes('already registered'))
  ) {
    await createUserWithCredentials(email, password)
    await loginViaUi(page, email, password)
    return { via: 'admin-fallback', note: errorText.trim() }
  }

  throw new Error(errorText ?? 'Registrierung fehlgeschlagen (unbekannter UI-Zustand)')
}

export async function loginViaUi(page, email, password) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort').fill(password)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await page.waitForURL('/', { timeout: 15_000 })
}

export async function startOnboardingFromWelcome(page) {
  await page.goto('/onboarding')
  await expect(page.getByRole('heading', { name: /Willkommen/ })).toBeVisible()
  await page.getByRole('button', { name: 'Garten einrichten' }).click()
  await expect(page).toHaveURL(/\/onboarding\/2/)
}

export async function selectLawnCount(page, count) {
  const labels = {
    1: '1 Rasenfläche',
    2: '2 Rasenflächen',
    3: '3 Rasenflächen',
  }

  await page.getByRole('button', { name: labels[count], exact: true }).click()
}

export async function selectCarePreference(page, preference) {
  const label = preference === 'together' ? 'Meistens gemeinsam' : 'Lieber einzeln'
  await page.getByRole('button', { name: new RegExp(label) }).click()
}

export async function fillAreaSize(page, size) {
  const input = page.getByLabel('Größe der Rasenfläche in Quadratmetern')
  await input.fill('')
  await input.fill(String(size))
}

export async function clickPrimaryButton(page, name) {
  await page.getByRole('button', { name, exact: true }).click()
}

export async function skipAreaSize(page) {
  await page.getByRole('button', { name: 'Später eingeben' }).click()
}

export async function assertNoTechnicalTerms(page) {
  const bodyText = (await page.locator('body').innerText()).toLowerCase()

  for (const term of FORBIDDEN_UI_TERMS) {
    expect(bodyText, `UI enthält technischen Begriff: ${term}`).not.toContain(term)
  }
}

export async function assertOnboardingCopy(page) {
  await expect(page.getByRole('heading', { name: /Willkommen.*Greenkeeper/ })).toBeVisible()
}

export async function completeSingleLawnWithSize(page, size) {
  await selectLawnCount(page, 1)
  await expect(page.getByRole('heading', { name: 'Wie groß ist deine Rasenfläche?' })).toBeVisible()
  await fillAreaSize(page, size)
  await expect(page.getByRole('button', { name: 'Los geht’s' })).toBeEnabled()
  await clickPrimaryButton(page, 'Los geht’s')
  await page.waitForURL('/', { timeout: 20_000 })
}

export async function completeSingleLawnSkipSize(page) {
  await selectLawnCount(page, 1)
  await skipAreaSize(page)
  await page.waitForURL('/', { timeout: 20_000 })
}

export async function completeTwoLawnsTogether(page, sizes) {
  await selectLawnCount(page, 2)
  await selectCarePreference(page, 'together')
  await expect(page.getByText('Rasenfläche 1 von 2')).toBeVisible()

  for (let index = 0; index < sizes.length; index += 1) {
    const isLast = index === sizes.length - 1
    await fillAreaSize(page, sizes[index])
    const buttonName = isLast ? 'Los geht’s' : 'Weiter'
    await expect(page.getByRole('button', { name: buttonName, exact: true })).toBeEnabled()
    await clickPrimaryButton(page, buttonName)

    if (!isLast) {
      await expect(page.getByText(`Rasenfläche ${index + 2} von 2`)).toBeVisible()
    }
  }

  await page.waitForURL('/', { timeout: 20_000 })
}

export async function completeTwoLawnsSeparate(page, sizes) {
  await selectLawnCount(page, 2)
  await selectCarePreference(page, 'separate')

  for (let index = 0; index < sizes.length; index += 1) {
    const isLast = index === sizes.length - 1

    if (sizes[index] !== null) {
      await fillAreaSize(page, sizes[index])
    } else {
      await skipAreaSize(page)
      break
    }

    const buttonName = isLast ? 'Los geht’s' : 'Weiter'
    await clickPrimaryButton(page, buttonName)

    if (!isLast) {
      await expect(page.getByText(`Rasenfläche ${index + 2} von 2`)).toBeVisible()
    }
  }

  await page.waitForURL('/', { timeout: 20_000 })
}
