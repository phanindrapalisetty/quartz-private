import { expect, test } from '@playwright/test'
import { loginAs, mockAuthMe, SESSION_KEY, MOCK_USER } from './helpers.js'

test.describe('Login page', () => {
  test('shows login button when unauthenticated', async ({ page }) => {
    // No session in localStorage → unauthenticated
    await page.route('**/auth/me**', (route) => route.fulfill({ status: 401, body: '{}' }))
    await page.goto('/')

    await expect(page.getByRole('button', { name: /login with google/i })).toBeVisible()
  })

  test('login button points to backend /auth/login', async ({ page }) => {
    await page.route('**/auth/me**', (route) => route.fulfill({ status: 401, body: '{}' }))
    await page.goto('/')

    const btn = page.getByRole('link', { name: /login with google/i })
      .or(page.getByRole('button', { name: /login with google/i }))
    const href = await btn.getAttribute('href')
    expect(href).toMatch(/\/auth\/login/)
  })

  test('redirects to load page after OAuth callback sets session_id param', async ({ page }) => {
    await mockAuthMe(page)
    await page.route('**/sheets/loaded**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    await page.route('**/connectors/db/list**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )

    // Simulate OAuth callback by navigating with ?session_id= param
    await page.goto(`/?session_id=${encodeURIComponent('test-session-xyz')}`)

    // App should consume the param and redirect away from the login page
    await page.waitForURL((url) => !url.searchParams.has('session_id'), { timeout: 5000 })

    // Session should be persisted in localStorage
    const stored = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)
    expect(stored).toBe('test-session-xyz')
  })

  test('shows user name when authenticated', async ({ page }) => {
    await loginAs(page)
    await mockAuthMe(page)
    await page.route('**/sheets/loaded**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    await page.route('**/connectors/db/list**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    await page.goto('/')

    await expect(page.getByText(MOCK_USER.name)).toBeVisible({ timeout: 5000 })
  })

  test('logout clears session and shows login page', async ({ page }) => {
    await loginAs(page)
    await mockAuthMe(page)
    await page.route('**/sheets/loaded**', (r) => r.fulfill({ status: 200, body: '[]' }))
    await page.route('**/connectors/db/list**', (r) => r.fulfill({ status: 200, body: '[]' }))
    await page.route('**/auth/logout**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    )
    await page.goto('/')

    // Click logout
    await page.getByRole('button', { name: /logout/i }).click()

    // Session cleared from localStorage
    const stored = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)
    expect(stored).toBeNull()

    await expect(page.getByRole('button', { name: /login with google/i })
      .or(page.getByRole('link', { name: /login with google/i }))).toBeVisible({ timeout: 5000 })
  })
})
