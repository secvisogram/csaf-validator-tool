import type { Page } from '@playwright/test'
import { DOCUMENT_20, expect, openWithText, test } from './fixtures.ts'

const notice = (page: Page) =>
  page
    .getByRole('status')
    .filter({ hasText: 'Runtime configuration was not applied' })
const checked = (page: Page, name: string) =>
  expect(page.getByRole('radio', { name })).toBeChecked()

test('without a configuration file the built-in defaults apply and nothing is reported', async ({
  page,
}) => {
  await page.goto('./')

  await expect(
    page.getByRole('heading', { name: 'Test selection' }),
  ).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
  await checked(page, 'csaf-validator-lib, in this browser')
  await checked(page, 'Use the version declared in the document (default)')
  await checked(page, 'All messages')
  await expect(
    page.getByLabel('JavaScript service URL', { exact: true }),
  ).toHaveValue('')
  await expect(
    page.getByLabel('Rust service URL', { exact: true }),
  ).toHaveValue('')
})

test('a valid file provides the starting values', async ({
  page,
  runtimeConfig,
}) => {
  await runtimeConfig({
    version: 1,
    services: {
      javascript: 'http://127.0.0.1:9101/',
      rust: 'http://127.0.0.1:9102',
    },
    defaults: {
      validator: 'csaf-validator-service',
      csafVersion: '2.1',
      reportView: 'detailed',
    },
  })
  await page.goto('./')

  await checked(page, 'csaf-validator-service (JavaScript service)')
  await checked(page, 'CSAF 2.1 (experimental CSD04)')
  await checked(page, 'Detailed report')
  await expect(
    page.getByLabel('JavaScript service URL', { exact: true }),
  ).toHaveValue('http://127.0.0.1:9101')
  await expect(
    page.getByLabel('Rust service URL', { exact: true }),
  ).toHaveValue('http://127.0.0.1:9102')
  await expect(notice(page)).toHaveCount(0)
})

test('session edits win over the file and are not kept', async ({
  page,
  runtimeConfig,
}) => {
  await runtimeConfig({
    version: 1,
    services: { javascript: 'http://127.0.0.1:9101' },
    defaults: { validator: 'csaf-validator-service' },
  })
  await page.goto('./')
  await page.getByLabel('csaf-rs (WASM), in this browser').check()
  await page
    .getByLabel('JavaScript service URL', { exact: true })
    .fill('http://127.0.0.1:9999/api')
  await checked(page, 'csaf-rs (WASM), in this browser')

  await page.reload()
  await checked(page, 'csaf-validator-service (JavaScript service)')
  await expect(
    page.getByLabel('JavaScript service URL', { exact: true }),
  ).toHaveValue('http://127.0.0.1:9101')
})

test('an edited service URL is the destination of the next run', async ({
  page,
  runtimeConfig,
}) => {
  await runtimeConfig({
    version: 1,
    services: { javascript: 'http://127.0.0.1:9101' },
    defaults: { validator: 'csaf-validator-service' },
  })
  await openWithText(page, DOCUMENT_20)
  await expect(
    page.getByText('Destination: http://127.0.0.1:9101/api/v1/validate'),
  ).toBeVisible()

  await page
    .getByLabel('JavaScript service URL', { exact: true })
    .fill('http://127.0.0.1:9999/api/')
  await expect(
    page.getByText('Destination: http://127.0.0.1:9999/api/api/v1/validate'),
  ).toBeVisible()
})

test('a service without a URL is unavailable and cannot run', async ({
  page,
}) => {
  await openWithText(page, DOCUMENT_20)
  await page.getByLabel('csaf-validator-service (JavaScript service)').check()

  await expect(
    page.getByText('Enter a JavaScript service URL', { exact: false }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Run selected tests' }),
  ).toBeDisabled()
})

test('a service URL with credentials is not applied', async ({ page }) => {
  await page.goto('./')
  await page
    .getByLabel('JavaScript service URL', { exact: true })
    .fill('http://user:secret@127.0.0.1:9101')

  await expect(
    page.getByRole('alert').filter({ hasText: 'Not applied' }),
  ).toHaveText('Not applied: the URL must not contain credentials.')
})

for (const [name, config, expected] of [
  ['is not JSON', '{ "version": ', 'is not valid JSON'],
  ['is not an object', '[1]', 'must contain a JSON object'],
  [
    'has the wrong version',
    { version: 2, services: {}, defaults: {} },
    'The version must be 1.',
  ],
  [
    'has an unknown field',
    { version: 1, services: {}, defaults: {}, presets: ['full'] },
    'Unknown field.',
  ],
  [
    'has an unsupported value',
    { version: 1, services: {}, defaults: { validator: 'nope' } },
    'Unsupported value.',
  ],
  [
    'has a service URL with a query',
    {
      version: 1,
      services: { javascript: 'http://127.0.0.1:9101/?a=1' },
      defaults: {},
    },
    'The URL must not contain a query.',
  ],
] as const) {
  test(`a file that ${name} is rejected as a whole`, async ({
    page,
    runtimeConfig,
  }) => {
    await runtimeConfig(config)
    await page.goto('./')

    await expect(notice(page)).toContainText(expected)
    await expect(notice(page)).toContainText(
      'The built-in defaults are in use.',
    )
    await checked(page, 'csaf-validator-lib, in this browser')
    await expect(
      page.getByRole('heading', { name: 'Test selection' }),
    ).toBeVisible()
  })
}

test('a valid part of a rejected file is not used', async ({
  page,
  runtimeConfig,
}) => {
  await runtimeConfig({
    version: 1,
    services: { javascript: 'http://127.0.0.1:9101' },
    defaults: { validator: 'csaf-validator-service', reportView: 'nope' },
  })
  await page.goto('./')

  await expect(notice(page)).toBeVisible()
  await checked(page, 'csaf-validator-lib, in this browser')
  await expect(
    page.getByLabel('JavaScript service URL', { exact: true }),
  ).toHaveValue('')
})

test('a server error for the file is reported and the defaults apply', async ({
  page,
}) => {
  await page.route('**/.well-known/appspecific/runtime-config.json', (route) =>
    route.fulfill({ status: 500, body: 'oops' }),
  )
  await page.goto('./')

  await expect(notice(page)).toContainText('(HTTP 500)')
  await checked(page, 'csaf-validator-lib, in this browser')
})

test('an unreachable file is reported and the defaults apply', async ({
  page,
}) => {
  await page.route('**/.well-known/appspecific/runtime-config.json', (route) =>
    route.abort(),
  )
  await page.goto('./')

  await expect(notice(page)).toContainText('network error')
  await checked(page, 'csaf-validator-lib, in this browser')
})
