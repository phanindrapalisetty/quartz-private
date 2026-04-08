import { expect, test } from '@playwright/test'
import {
  setupAuthenticatedSession,
  MOCK_SHEETS, MOCK_TABS, MOCK_LOADED_TABLES,
} from './helpers.js'

test.describe('Load page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page)
  })

  // ── Tab switching ────────────────────────────────────────────────────────

  test('shows three tabs: Google Sheets, Upload File, Databases', async ({ page }) => {
    await page.goto('/load')
    await expect(page.getByRole('button', { name: /google sheets/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /upload file/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /databases/i })).toBeVisible()
  })

  // ── Google Sheets tab ────────────────────────────────────────────────────

  test('lists spreadsheets from API', async ({ page }) => {
    await page.route('**/sheets/list**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SHEETS) })
    )
    await page.goto('/load')

    await expect(page.getByText('Sales 2024')).toBeVisible()
    await expect(page.getByText('Inventory')).toBeVisible()
  })

  test('shows tabs when spreadsheet row is expanded', async ({ page }) => {
    await page.route('**/sheets/list**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SHEETS) })
    )
    await page.route('**/sheets/sheet-1/tabs**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TABS) })
    )
    await page.goto('/load')

    await page.getByText('Sales 2024').click()
    await expect(page.getByText('Sheet1')).toBeVisible()
    await expect(page.getByText('Summary')).toBeVisible()
  })

  test('shows success message after loading a tab', async ({ page }) => {
    await page.route('**/sheets/list**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SHEETS) })
    )
    await page.route('**/sheets/sheet-1/tabs**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TABS) })
    )
    await page.route('**/sheets/sheet-1/load**', (r) =>
      r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ table_name: 'sheet1', rows: 42, columns: ['a', 'b'], preview: [] }),
      })
    )
    await page.goto('/load')
    await page.getByText('Sales 2024').click()

    // Click Load on the first tab
    await page.getByRole('button', { name: /^load$/i }).first().click()
    await expect(page.getByText(/loaded as.*sheet1.*42 rows/i)).toBeVisible({ timeout: 5000 })
  })

  test('shows error when sheets API fails', async ({ page }) => {
    await page.route('**/sheets/list**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"Drive API error"}' })
    )
    await page.goto('/load')
    await expect(page.getByText(/Drive API error/i)).toBeVisible({ timeout: 5000 })
  })

  test('refresh button re-fetches sheets', async ({ page }) => {
    let callCount = 0
    await page.route('**/sheets/list**', (route) => {
      callCount++
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SHEETS) })
    })
    await page.goto('/load')
    await page.getByRole('button', { name: /refresh/i }).click()
    await page.waitForTimeout(500)
    expect(callCount).toBeGreaterThanOrEqual(2)
  })

  // ── Upload tab ────────────────────────────────────────────────────────────

  test('upload tab shows dropzone', async ({ page }) => {
    await page.goto('/load')
    await page.getByRole('button', { name: /upload file/i }).click()
    await expect(page.getByText(/drop a file here/i)).toBeVisible()
    await expect(page.getByText(/csv.*xlsx/i)).toBeVisible()
  })

  test('upload shows success after file is submitted', async ({ page }) => {
    await page.route('**/connectors/upload**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ table_name: 'my_data', rows: 10, columns: ['a'], preview: [] }),
      })
    )
    await page.goto('/load')
    await page.getByRole('button', { name: /upload file/i }).click()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'my_data.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('a,b\n1,2\n3,4'),
    })

    await page.getByRole('button', { name: /upload & load/i }).click()
    await expect(page.getByText(/loaded as.*my_data.*10 rows/i)).toBeVisible({ timeout: 5000 })
  })

  // ── Databases tab ─────────────────────────────────────────────────────────

  test('databases tab shows connection form', async ({ page }) => {
    await page.goto('/load')
    await page.getByRole('button', { name: /databases/i }).click()
    await expect(page.getByText(/connection string/i)).toBeVisible()
    await expect(page.getByPlaceholder(/postgresql:\/\//i)).toBeVisible()
  })

  test('databases tab shows connected dbs from API', async ({ page }) => {
    await page.route('**/connectors/db/list**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ alias: 'prod_db', db_type: 'postgres', tables: [] }]),
      })
    )
    await page.goto('/load')
    await page.getByRole('button', { name: /databases/i }).click()
    await expect(page.getByText('prod_db')).toBeVisible({ timeout: 5000 })
  })

  // ── Loaded tables section ─────────────────────────────────────────────────

  test('loaded tables section shows tables from API', async ({ page }) => {
    await page.goto('/load')
    await expect(page.getByText('sales_2024')).toBeVisible()
    await expect(page.getByText('3 columns')).toBeVisible()
  })

  test('drop button removes table', async ({ page }) => {
    await page.route('**/sheets/loaded/sales_2024**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    )
    let loadedCallCount = 0
    await page.route('**/sheets/loaded**', (route) => {
      loadedCallCount++
      // Return empty after first call (simulating the drop)
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: loadedCallCount === 1 ? JSON.stringify(MOCK_LOADED_TABLES) : '[]',
      })
    })
    await page.goto('/load')

    await page.getByTitle('Drop table').click()
    await expect(page.getByText('No tables loaded yet')).toBeVisible({ timeout: 5000 })
  })
})
