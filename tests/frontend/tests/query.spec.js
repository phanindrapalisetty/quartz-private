import { expect, test } from '@playwright/test'
import { setupAuthenticatedSession, MOCK_QUERY_RESULT, MOCK_LOADED_TABLES } from './helpers.js'

test.describe('Query page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page)
    await page.route('**/query/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUERY_RESULT) })
    )
  })

  // ── Editor ────────────────────────────────────────────────────────────────

  test('shows SQL editor and Run button', async ({ page }) => {
    await page.goto('/query')
    await expect(page.locator('.cm-editor')).toBeVisible()
    await expect(page.getByRole('button', { name: /run/i })).toBeVisible()
  })

  test('shows schema sidebar with loaded tables', async ({ page }) => {
    await page.goto('/query')
    await expect(page.getByText('sales_2024')).toBeVisible()
    await expect(page.getByText('Schema')).toBeVisible()
  })

  test('schema sidebar shows columns when table is expanded', async ({ page }) => {
    await page.goto('/query')
    await page.getByText('sales_2024').click()
    await expect(page.getByText('revenue')).toBeVisible()
    await expect(page.getByText('DOUBLE')).toBeVisible()
  })

  // ── Running queries ───────────────────────────────────────────────────────

  test('run button sends SQL and shows results', async ({ page }) => {
    await page.goto('/query')
    await page.getByRole('button', { name: /run/i }).click()

    await expect(page.getByText('3 rows')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Widget')).toBeVisible()
    await expect(page.getByText('Gadget')).toBeVisible()
  })

  test('null values render as italic "null" in results', async ({ page }) => {
    await page.goto('/query')
    await page.getByRole('button', { name: /run/i }).click()

    // The third row has revenue: null
    await expect(page.locator('td span.italic')).toHaveText('null')
  })

  test('execution time is shown after query runs', async ({ page }) => {
    await page.goto('/query')
    await page.getByRole('button', { name: /run/i }).click()

    await expect(page.getByText(/4 ms/)).toBeVisible({ timeout: 5000 })
  })

  test('shows error message on failed query', async ({ page }) => {
    await page.route('**/query/**', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"detail":"Table not found"}' })
    )
    await page.goto('/query')
    await page.getByRole('button', { name: /run/i }).click()
    await expect(page.getByText('Table not found')).toBeVisible({ timeout: 5000 })
  })

  test('Cmd+Enter runs the query', async ({ page }) => {
    let queryCalled = false
    await page.route('**/query/**', (route) => {
      queryCalled = true
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUERY_RESULT) })
    })
    await page.goto('/query')

    const editor = page.locator('.cm-editor')
    await editor.click()
    await page.keyboard.press('Meta+Enter')

    await page.waitForTimeout(500)
    expect(queryCalled).toBe(true)
  })

  // ── Tab management ────────────────────────────────────────────────────────

  test('opens with one tab labelled Query 1', async ({ page }) => {
    await page.goto('/query')
    await expect(page.getByText('Query 1')).toBeVisible()
  })

  test('plus button adds a new tab', async ({ page }) => {
    await page.goto('/query')
    await page.getByTitle('New tab').click()
    await expect(page.getByText('Query 2')).toBeVisible()
  })

  test('each tab maintains its own query', async ({ page }) => {
    await page.goto('/query')

    // Type something in tab 1
    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('SELECT 1')

    // Add tab 2
    await page.getByTitle('New tab').click()

    // Switch back to tab 1 — query should still be there
    await page.getByText('Query 1').click()
    await expect(editor).toContainText('SELECT 1')
  })

  test('close button removes a tab', async ({ page }) => {
    await page.goto('/query')
    await page.getByTitle('New tab').click()

    // Hover the first tab to reveal the X
    await page.getByText('Query 1').hover()
    await page.locator('[title="New tab"]').locator('..').locator('button').first().click()

    await expect(page.getByText('Query 1')).not.toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Query 2')).toBeVisible()
  })

  // ── Save, Share, CSV ──────────────────────────────────────────────────────

  test('Save button triggers file download with .sql extension', async ({ page }) => {
    await page.goto('/query')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /save/i }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.sql$/)
  })

  test('Share button copies URL to clipboard and shows Copied!', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/query')

    await page.getByRole('button', { name: /share/i }).click()
    await expect(page.getByText('Copied!')).toBeVisible({ timeout: 3000 })

    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toMatch(/\/query\?q=/)
  })

  test('shared URL decodes back to original query', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/query')

    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('Control+A')
    const testQuery = 'SELECT * FROM my_table LIMIT 5'
    await page.keyboard.type(testQuery)

    await page.getByRole('button', { name: /share/i }).click()
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText())

    // Navigate to the share link
    await page.route('**/sheets/loaded**', (r) => r.fulfill({ status: 200, body: '[]' }))
    await page.goto(shareUrl.replace(page.url().replace('/query', ''), ''))

    await expect(page.locator('.cm-content')).toContainText('SELECT * FROM my_table')
  })

  test('Download CSV triggers download after query runs', async ({ page }) => {
    await page.goto('/query')
    await page.getByRole('button', { name: /run/i }).click()
    await expect(page.getByText('3 rows')).toBeVisible({ timeout: 5000 })

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /download csv/i }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.csv$/)
  })

  // ── Ask AI ────────────────────────────────────────────────────────────────

  test('Ask AI button opens modal with placeholder message', async ({ page }) => {
    await page.goto('/query')
    await page.getByRole('button', { name: /ask ai/i }).click()

    await expect(page.getByText(/brewing|in progress|soon/i)).toBeVisible({ timeout: 3000 })
  })

  test('Ask AI modal closes on Got it click', async ({ page }) => {
    await page.goto('/query')
    await page.getByRole('button', { name: /ask ai/i }).click()
    await page.getByRole('button', { name: /got it/i }).click()

    await expect(page.getByText(/brewing|in progress|soon/i)).not.toBeVisible({ timeout: 3000 })
  })
})
