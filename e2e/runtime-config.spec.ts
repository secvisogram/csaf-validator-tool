import type { Page } from '@playwright/test'
import {
  DOCUMENT_20,
  chooseValidator,
  expect,
  expectRunCompleted,
  goToStep,
  minimalDocument,
  openWithText,
  setServiceUrl,
  startRun,
  test,
} from './fixtures.ts'

const notice = (page: Page) =>
  page
    .getByRole('status')
    .filter({ hasText: 'Runtime configuration was not applied' })
const validator = (page: Page) => page.getByLabel('Validator', { exact: true })
const version = (page: Page) => page.getByLabel('CSAF version', { exact: true })
const serviceUrl = (page: Page, service: 'JavaScript' | 'Rust') =>
  page.getByLabel(`${service} service URL`, { exact: true })

/** Runs csaf-rs, which is quick, and returns which report view the run opened on. */
async function openedReportView(page: Page) {
  await chooseValidator(page, 'csaf-rs (WASM), in this browser')
  await startRun(page)
  await expectRunCompleted(page)
  return page.getByRole('tab', { selected: true })
}

test('without a configuration file the built-in defaults apply and nothing is reported', async ({
  page,
}) => {
  await openWithText(page, minimalDocument())

  await expect(notice(page)).toHaveCount(0)
  await expect(validator(page)).toHaveValue('csaf-validator-lib')
  await expect(version(page)).toHaveValue('document')
  await expect(serviceUrl(page, 'JavaScript')).toHaveValue('')
  await expect(serviceUrl(page, 'Rust')).toHaveValue('')
  await expect(await openedReportView(page)).toHaveText('All messages')
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
  await openWithText(page, minimalDocument())

  await expect(validator(page)).toHaveValue('csaf-validator-service')
  await expect(version(page)).toHaveValue('2.1')
  await expect(serviceUrl(page, 'JavaScript')).toHaveValue(
    'http://127.0.0.1:9101',
  )
  await expect(serviceUrl(page, 'Rust')).toHaveValue('http://127.0.0.1:9102')
  await expect(notice(page)).toHaveCount(0)
})

test('the configured report view is the one a run opens on', async ({
  page,
  runtimeConfig,
}) => {
  await runtimeConfig({
    version: 1,
    services: {},
    defaults: { reportView: 'detailed' },
  })
  await openWithText(page, DOCUMENT_20)

  await expect(await openedReportView(page)).toHaveText('Detailed report')
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
  await openWithText(page, minimalDocument())
  await chooseValidator(page, 'csaf-rs (WASM), in this browser')
  await setServiceUrl(page, 'JavaScript', 'http://127.0.0.1:9999/api')
  await expect(validator(page)).toHaveValue('csaf-rs-wasm')
  await expect(serviceUrl(page, 'JavaScript')).toHaveValue(
    'http://127.0.0.1:9999/api',
  )

  await page.reload()
  await openWithText(page, minimalDocument())
  await expect(validator(page)).toHaveValue('csaf-validator-service')
  await expect(serviceUrl(page, 'JavaScript')).toHaveValue(
    'http://127.0.0.1:9101',
  )
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
  await goToStep(page, 'Run & report')
  await expect(
    page.getByText('Destination: http://127.0.0.1:9101/api/v1/validate'),
  ).toBeVisible()

  await setServiceUrl(page, 'JavaScript', 'http://127.0.0.1:9999/api/')
  await goToStep(page, 'Run & report')
  await expect(
    page.getByText('Destination: http://127.0.0.1:9999/api/api/v1/validate'),
  ).toBeVisible()
})

test('a service without a URL is unavailable and cannot run', async ({
  page,
}) => {
  await openWithText(page, DOCUMENT_20)
  await chooseValidator(page, 'csaf-validator-service (JavaScript service)')

  await expect(
    page.getByText(/Unavailable: Enter a JavaScript service URL/),
  ).toBeVisible()
  await goToStep(page, 'Run & report')
  await expect(
    page.getByRole('button', { name: 'Run selected tests' }),
  ).toBeDisabled()
})

test('a service URL with credentials is not applied', async ({ page }) => {
  await openWithText(page, minimalDocument())
  await setServiceUrl(page, 'JavaScript', 'http://user:secret@127.0.0.1:9101')

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
    await expect(
      page.getByRole('heading', { name: 'Provide a document' }),
    ).toBeVisible()
    await openWithText(page, minimalDocument())
    await expect(validator(page)).toHaveValue('csaf-validator-lib')
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
  await openWithText(page, minimalDocument())

  await expect(notice(page)).toBeVisible()
  await expect(validator(page)).toHaveValue('csaf-validator-lib')
  await expect(serviceUrl(page, 'JavaScript')).toHaveValue('')
})

test('a server error for the file is reported and the defaults apply', async ({
  page,
}) => {
  await page.route('**/.well-known/appspecific/runtime-config.json', (route) =>
    route.fulfill({ status: 500, body: 'oops' }),
  )
  await openWithText(page, minimalDocument())

  await expect(notice(page)).toContainText('(HTTP 500)')
  await expect(validator(page)).toHaveValue('csaf-validator-lib')
})

test('an unreachable file is reported and the defaults apply', async ({
  page,
}) => {
  await page.route('**/.well-known/appspecific/runtime-config.json', (route) =>
    route.abort(),
  )
  await openWithText(page, minimalDocument())

  await expect(notice(page)).toContainText('network error')
  await expect(validator(page)).toHaveValue('csaf-validator-lib')
})
