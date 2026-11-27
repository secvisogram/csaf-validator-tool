import { expect, test as base, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { startMock, type Mock, type MockHandler } from './mock.ts'

const fixture = (name: string) =>
  readFileSync(
    new URL(`../src/adapters/csafrs/fixtures/${name}`, import.meta.url),
    'utf8',
  )

/** Schema-valid documents from the OASIS test data, as JSON text. */
export const DOCUMENT_20 = fixture('valid-csaf-2.0.json')
export const DOCUMENT_21 = fixture('valid-csaf-2.1.json')

/** A document that declares a version and nothing else. Intake accepts it. */
export const minimalDocument = (version: string | null = '2.0') =>
  JSON.stringify({ document: version ? { csaf_version: version } : {} })

type Fixtures = {
  /** Starts a mock server that is closed when the test ends. */
  mock: (handler: MockHandler, options?: { cors?: boolean }) => Promise<Mock>
  /** Answers the runtime configuration request with this body, as a 200. */
  runtimeConfig: (body: unknown) => Promise<void>
  /** Answers the hint file request with this text, as a 200. */
  hintFile: (yaml: string) => Promise<void>
  /** Every URL the page requests, including those of its workers. */
  requested: string[]
}

export const test = base.extend<Fixtures>({
  // Playwright requires the fixtures argument to be a destructuring pattern.
  // eslint-disable-next-line no-empty-pattern
  mock: async ({}, use) => {
    const started: Mock[] = []
    await use(async (handler, options) => {
      const mock = await startMock(handler, options)
      started.push(mock)
      return mock
    })
    await Promise.all(started.map((mock) => mock.close()))
  },
  runtimeConfig: async ({ page }, use) => {
    await use(async (body) => {
      await page.route(
        '**/.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json',
        (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: typeof body === 'string' ? body : JSON.stringify(body),
          }),
      )
    })
  },
  hintFile: async ({ page }, use) => {
    await use(async (yaml) => {
      await page.route('**/hints.yaml', (route) =>
        route.fulfill({ status: 200, contentType: 'text/yaml', body: yaml }),
      )
    })
  },
  requested: async ({ context }, use) => {
    const urls: string[] = []
    context.on('request', (request) => urls.push(request.url()))
    await use(urls)
  },
})

export { expect }

/** The steps of the wizard, reached through the rail as a user does. */
export type StepTitle = 'Document' | 'Tests' | 'Run & report'

export async function goToStep(page: Page, title: StepTitle) {
  await page
    .getByRole('navigation', { name: 'Steps' })
    .getByRole('button', { name: new RegExp(`^${title}`) })
    .click()
}

export type Source = 'Paste JSON' | 'Open a file' | 'Fetch from a URL'

/** Shows the Document step with the input for this source. */
export async function chooseSource(page: Page, source: Source) {
  await goToStep(page, 'Document')
  await page.getByRole('tab', { name: source }).click()
}

/** Opens the app and provides the document as pasted text. Loading it moves on to the Tests step. */
export async function openWithText(page: Page, text: string) {
  await page.goto('./')
  await useText(page, text)
}

export async function useText(page: Page, text: string) {
  await chooseSource(page, 'Paste JSON')
  await page.getByLabel('CSAF document (JSON)').fill(text)
  await page.getByRole('button', { name: 'Use text' }).click()
}

export async function useFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await chooseSource(page, 'Open a file')
  await page.getByLabel('CSAF document file').setInputFiles(file)
}

export async function fetchUrl(page: Page, url: string) {
  await chooseSource(page, 'Fetch from a URL')
  await page.getByLabel('Document URL').fill(url)
  await page.getByRole('button', { name: 'Fetch' }).click()
}

/** The Document step with the loaded document. */
export async function documentSection(page: Page) {
  await goToStep(page, 'Document')
  return page.getByRole('region', { name: 'Document', exact: true })
}

const VALIDATOR_IDS = {
  'csaf-validator-lib, in this browser': 'csaf-validator-lib',
  'csaf-rs (WASM), in this browser': 'csaf-rs-wasm',
  'csaf-validator-service (JavaScript service)': 'csaf-validator-service',
  'csaf-service (Rust service)': 'csaf-service',
} as const
export type ValidatorName = keyof typeof VALIDATOR_IDS

/** Selects the validator on the Tests step. */
export async function chooseValidator(page: Page, name: ValidatorName) {
  await goToStep(page, 'Tests')
  await page
    .getByLabel('Validator', { exact: true })
    .selectOption(VALIDATOR_IDS[name])
}

/** Selects the CSAF version on the Tests step: the declared one, or 2.0 or 2.1 explicitly. */
export async function chooseVersion(
  page: Page,
  version: 'document' | '2.0' | '2.1',
) {
  await goToStep(page, 'Tests')
  await page.getByLabel('CSAF version', { exact: true }).selectOption(version)
}

/** Fills a service URL. The field sits in the collapsed "Service URLs" part of the Tests step. */
export async function setServiceUrl(
  page: Page,
  service: 'JavaScript' | 'Rust',
  url: string,
) {
  await goToStep(page, 'Tests')
  const field = page.getByLabel(`${service} service URL`, { exact: true })
  if (!(await field.isVisible())) {
    await page.getByText('Service URLs', { exact: true }).click()
  }
  await field.fill(url)
}

export const runButton = (page: Page) =>
  page.getByRole('button', { name: 'Run selected tests' })

/** Goes to the Run step and starts the run with the selection as it is. */
export async function startRun(page: Page) {
  await goToStep(page, 'Run & report')
  await runButton(page).click()
}

/** The report state line of a run that has reached this phase. Library runs can take several seconds. */
export const runState = (page: Page, phase: string) =>
  page.getByRole('status').filter({ hasText: phase })

export const expectRunCompleted = (page: Page) =>
  expect(runState(page, 'Run completed')).toBeVisible({ timeout: 45_000 })

/** A promise the test settles by hand, to hold a mock service's answer back. */
export function deferred() {
  let release: () => void = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  return { released, release }
}
