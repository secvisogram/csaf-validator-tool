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
        '**/.well-known/appspecific/runtime-config.json',
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

/** Opens the app and provides the document as pasted text. */
export async function openWithText(page: Page, text: string) {
  await page.goto('./')
  await useText(page, text)
}

export async function useText(page: Page, text: string) {
  await page.getByLabel('CSAF document (JSON)').fill(text)
  await page.getByRole('button', { name: 'Use text' }).click()
}

export const chooseValidator = (page: Page, name: string) =>
  page.getByRole('radio', { name }).check()

export const runButton = (page: Page) =>
  page.getByRole('button', { name: 'Run selected tests' })

/** The report state line of a run that has reached this phase. Library runs can take several seconds. */
export const runState = (page: Page, phase: string) =>
  page.getByRole('status').filter({ hasText: phase })

export const expectRunCompleted = (page: Page) =>
  expect(runState(page, 'Run completed')).toBeVisible({ timeout: 60_000 })

/** A promise the test settles by hand, to hold a mock service's answer back. */
export function deferred() {
  let release: () => void = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  return { released, release }
}
