import type { Page } from '@playwright/test'
import {
  DOCUMENT_20,
  chooseValidator,
  expect,
  expectRunCompleted,
  openWithText,
  runButton,
  test,
} from './fixtures.ts'
import { serviceAnswer } from './service.ts'

type Stored = {
  local: number
  session: number
  cookie: string
  databases: number
  caches: number
  workers: number
}

/** Everything the page could have kept in the browser. */
const stored = (page: Page): Promise<Stored> =>
  page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }))

const NOTHING: Stored = {
  local: 0,
  session: 0,
  cookie: '',
  databases: 0,
  caches: 0,
  workers: 0,
}

test.describe('nothing is kept in the browser', () => {
  test('the checks can see what a page stores', async ({ page }) => {
    await page.goto('./')
    await page.evaluate(async () => {
      localStorage.setItem('a', '1')
      sessionStorage.setItem('b', '2')
      document.cookie = 'c=3'
      indexedDB.open('d')
      await caches.open('e')
    })
    const seen = await stored(page)
    expect(seen.local).toBe(1)
    expect(seen.session).toBe(1)
    expect(seen.cookie).toBe('c=3')
    expect(seen.databases).toBe(1)
    expect(seen.caches).toBe(1)
  })

  test('after loading the app', async ({ page, context }) => {
    await page.goto('./')
    await expect(
      page.getByRole('heading', { name: 'Test selection' }),
    ).toBeVisible()

    expect(await stored(page)).toEqual(NOTHING)
    expect(await context.cookies()).toEqual([])
  })

  for (const [name, validator] of [
    ['the library', 'csaf-validator-lib, in this browser'],
    ['csaf-rs WebAssembly', 'csaf-rs (WASM), in this browser'],
  ]) {
    test(`after a run with ${name} and edits to every setting`, async ({
      page,
      context,
    }) => {
      await openWithText(page, DOCUMENT_20)
      await chooseValidator(page, validator as string)
      await page
        .getByRole('radio', { name: 'CSAF 2.0 (OASIS Standard)' })
        .check()
      await page.getByRole('radio', { name: 'Detailed report' }).check()
      await page
        .getByLabel('JavaScript service URL', { exact: true })
        .fill('http://127.0.0.1:9')
      await page.getByRole('checkbox', { name: /^Select 6\.1\.1 / }).uncheck()
      await runButton(page).click()
      await expectRunCompleted(page)

      expect(await stored(page)).toEqual(NOTHING)
      expect(await context.cookies()).toEqual([])
    })
  }

  test('after a run with a service, a file and a fetched document', async ({
    page,
    context,
    mock,
    runtimeConfig,
  }) => {
    const answer = serviceAnswer()
    const service = await mock((request) =>
      request.method === 'GET'
        ? { body: JSON.parse(DOCUMENT_20) }
        : answer(request),
    )
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await page.goto('./')
    await page.getByLabel('CSAF document file').setInputFiles({
      name: 'a.json',
      mimeType: 'application/json',
      buffer: Buffer.from(DOCUMENT_20),
    })
    await page.getByLabel('Document URL').fill(`${service.url}/doc.json`)
    await page.getByRole('button', { name: 'Fetch' }).click()
    await runButton(page).click()
    await expectRunCompleted(page)

    expect(await stored(page)).toEqual(NOTHING)
    expect(await context.cookies()).toEqual([])
  })

  test('and a reload starts empty again', async ({ page }) => {
    await openWithText(page, DOCUMENT_20)
    await page.reload()

    await expect(page.getByRole('region', { name: 'Document' })).toHaveCount(0)
    await expect(page.getByLabel('CSAF document (JSON)')).toHaveValue('')
  })
})

test.describe('the app talks only to its own origin and the chosen service', () => {
  const origin = (url: string) => new URL(url).origin

  test('the check can see a request to somewhere else', async ({
    page,
    requested,
  }) => {
    await page.goto('./')
    await page.evaluate(() =>
      fetch('http://analytics.invalid/collect', { mode: 'no-cors' }).catch(
        () => {},
      ),
    )
    expect(requested.map(origin)).toContain('http://analytics.invalid')
  })

  for (const validator of [
    'csaf-validator-lib, in this browser',
    'csaf-rs (WASM), in this browser',
  ]) {
    test(`a run with ${validator} makes no request but for the app files`, async ({
      page,
      requested,
    }) => {
      await openWithText(page, DOCUMENT_20)
      await chooseValidator(page, validator)
      await runButton(page).click()
      await expectRunCompleted(page)
      await page.getByRole('tab', { name: 'Detailed report' }).click()
      await page.getByRole('tab', { name: 'Summary' }).click()

      const app = origin(page.url())
      expect(requested.filter((url) => origin(url) !== app)).toEqual([])
      expect(requested.length).toBeGreaterThan(0)
    })
  }

  test('requests made by a worker are seen by the check', async ({
    page,
    requested,
  }) => {
    await openWithText(page, DOCUMENT_20)
    await chooseValidator(page, 'csaf-rs (WASM), in this browser')
    await runButton(page).click()
    await expectRunCompleted(page)

    expect(requested.some((url) => /\/worker-[\w-]+\.js$/.test(url))).toBe(true)
    expect(requested.some((url) => url.endsWith('.wasm'))).toBe(true)
  })

  test('a run with a service sends the document only to that service', async ({
    page,
    mock,
    requested,
    runtimeConfig,
  }) => {
    const service = await mock(serviceAnswer())
    const bystander = await mock(() => ({ body: {} }))
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url, rust: bystander.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, DOCUMENT_20)
    await runButton(page).click()
    await expectRunCompleted(page)

    const app = origin(page.url())
    const others = requested.filter((url) => origin(url) !== app)
    expect([...new Set(others.map(origin))]).toEqual([service.url])
    expect(service.requests).toHaveLength(1)
    expect(bystander.requests).toEqual([])
  })
})
