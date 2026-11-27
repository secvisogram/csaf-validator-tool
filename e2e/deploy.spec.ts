import { expect, test, type Page } from '@playwright/test'
import {
  DOCUMENT_20,
  chooseValidator,
  expectRunCompleted,
  minimalDocument,
  openWithText,
  runState,
  startRun,
} from './fixtures.ts'
import { SITES } from './sites.ts'

/** Every request the page and its workers make, with the status it got. */
function watchRequests(page: Page) {
  const seen: { url: URL; status: number }[] = []
  page.context().on('response', (response) => {
    seen.push({ url: new URL(response.url()), status: response.status() })
  })
  return seen
}

const RUNTIME_CONFIG =
  '.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json'

/** A completed run in which tests returned results, so the validator really ran. */
async function expectResults(page: Page, validator: string) {
  await expectRunCompleted(page)
  await expect(runState(page, 'Run completed')).toHaveText(
    /Run completed\s+[1-9]\d* of \d+ selected tests returned a result/,
  )
  await expect(page.getByRole('region', { name: 'Report' })).toContainText(
    validator,
  )
}

for (const site of SITES) {
  test.describe(`served ${site.name}`, () => {
    test.use({ baseURL: site.url })

    test('loads the page and its hints from the app path', async ({ page }) => {
      const seen = watchRequests(page)
      await page.goto('./')
      await expect(
        page.getByRole('heading', { name: 'CSAF Validator Tool', level: 1 }),
      ).toBeVisible()
      await expect(page.getByLabel('CSAF document (JSON)')).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'Provide a document' }),
      ).toBeVisible()

      const hints = seen.find(
        (r) => r.url.pathname === `${site.path}hints.yaml`,
      )
      expect(hints?.status).toBe(200)
      const config = seen.find(
        (r) => r.url.pathname === `${site.path}${RUNTIME_CONFIG}`,
      )
      // Pages ships no runtime configuration, so a 404 is the normal answer.
      expect(config?.status).toBe(404)
      // The first release read `runtime-config.json`. It is no longer requested.
      expect(
        seen.filter((r) => r.url.pathname.endsWith('/runtime-config.json')),
      ).toEqual([])
    })

    test('fetches its runtime configuration from the app path and applies it', async ({
      page,
    }) => {
      const requested: string[] = []
      await page.route(`**/${RUNTIME_CONFIG}`, (route) => {
        requested.push(new URL(route.request().url()).pathname)
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            version: 1,
            services: {},
            defaults: { validator: 'csaf-rs-wasm' },
          }),
        })
      })
      await openWithText(page, minimalDocument())

      await expect(page.getByLabel('Validator', { exact: true })).toHaveValue(
        'csaf-rs-wasm',
      )
      expect(requested).toEqual([`${site.path}${RUNTIME_CONFIG}`])
    })

    test('requests nothing outside the app path and nothing fails', async ({
      page,
    }) => {
      const seen = watchRequests(page)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('./')
      await expect(page.getByLabel('CSAF document (JSON)')).toBeVisible()

      const stray = seen.filter((r) => !r.url.pathname.startsWith(site.path))
      expect(stray.map((r) => r.url.href)).toEqual([])
      const failed = seen.filter(
        (r) => r.status >= 400 && !r.url.pathname.endsWith(RUNTIME_CONFIG),
      )
      expect(failed.map((r) => `${r.status} ${r.url.href}`)).toEqual([])
      expect(errors).toEqual([])
    })

    test('validates a document with the library in its worker', async ({
      page,
    }) => {
      const seen = watchRequests(page)
      await openWithText(page, DOCUMENT_20)
      await startRun(page)
      await expectResults(page, 'csaf-validator-lib, in this browser')

      const worker = seen.find((r) =>
        /\/worker-[\w-]+\.js$/.test(r.url.pathname),
      )
      expect(worker?.url.pathname.startsWith(site.path)).toBe(true)
      expect(worker?.status).toBe(200)
    })

    test('validates a document with csaf-rs WebAssembly in its worker', async ({
      page,
    }) => {
      const seen = watchRequests(page)
      await openWithText(page, DOCUMENT_20)
      await chooseValidator(page, 'csaf-rs (WASM), in this browser')
      await startRun(page)
      await expectResults(page, 'csaf-rs (WASM), in this browser')

      const wasm = seen.filter((r) => r.url.pathname.endsWith('.wasm'))
      expect(wasm.length).toBeGreaterThan(0)
      for (const request of wasm) {
        expect(request.url.pathname.startsWith(site.path)).toBe(true)
        expect(request.status).toBe(200)
      }
      const workers = seen.filter((r) =>
        /\/worker-[\w-]+\.js$/.test(r.url.pathname),
      )
      expect(workers.length).toBeGreaterThan(0)
      for (const request of workers) {
        expect(request.url.pathname.startsWith(site.path)).toBe(true)
        expect(request.status).toBe(200)
      }
    })
  })
}
