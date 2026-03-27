/**
 * Shared helpers for Playwright tests.
 */

export const SESSION_KEY = 'quartz_sid'
export const MOCK_SESSION = 'test-session-abc123'

export const MOCK_USER = {
  email: 'testuser@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg',
}

export const MOCK_SHEETS = [
  { id: 'sheet-1', name: 'Sales 2024',  modifiedTime: '2024-03-01T00:00:00Z', webViewLink: '#' },
  { id: 'sheet-2', name: 'Inventory',   modifiedTime: '2024-02-15T00:00:00Z', webViewLink: '#' },
]

export const MOCK_TABS = [
  { id: 0, name: 'Sheet1' },
  { id: 1, name: 'Summary' },
]

export const MOCK_LOADED_TABLES = [
  {
    name: 'sales_2024',
    schema: [
      { column: 'date',     type: 'VARCHAR' },
      { column: 'product',  type: 'VARCHAR' },
      { column: 'revenue',  type: 'DOUBLE' },
    ],
  },
]

export const MOCK_QUERY_RESULT = {
  rows: 3,
  columns: ['date', 'product', 'revenue'],
  data: [
    { date: '2024-01-01', product: 'Widget',   revenue: 1000 },
    { date: '2024-01-02', product: 'Gadget',   revenue: 2500 },
    { date: '2024-01-03', product: 'Doohickey', revenue: null },
  ],
  execution_time_ms: 4,
}

/**
 * Sets a fake session in localStorage so the app thinks the user is logged in.
 */
export async function loginAs(page, sessionId = MOCK_SESSION) {
  await page.addInitScript(
    ({ key, sid }) => localStorage.setItem(key, sid),
    { key: SESSION_KEY, sid: sessionId }
  )
}

/**
 * Stubs /auth/me to return a mock user (prevents 401 redirects).
 */
export async function mockAuthMe(page) {
  await page.route('**/auth/me**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  )
}

/**
 * Applies all common API mocks needed for an authenticated session.
 */
export async function setupAuthenticatedSession(page) {
  await loginAs(page)
  await mockAuthMe(page)
  await page.route('**/sheets/loaded**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_LOADED_TABLES) })
  )
  await page.route('**/connectors/db/list**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  )
}
