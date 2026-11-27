import type { Page } from '@playwright/test'
import {
  DOCUMENT_20,
  expect,
  expectRunCompleted,
  openWithText,
  runButton,
  test,
  useText,
} from './fixtures.ts'
import type { MockHandler } from './mock.ts'
import { serviceAnswer } from './service.ts'

/** Strings that would run code or open a script URL if they were ever interpreted. */
const HTML = "<img src='/hostile.png' onerror='window.__pwned = 1'>"
const SCRIPT = '<script>window.__pwned = 2</script>'
const SCRIPT_URL = 'javascript:window.__pwned = 3'
const MARKDOWN = '[click me](javascript:window.__pwned=4)'

const executed = (page: Page) =>
  page.evaluate(() => (window as { __pwned?: string }).__pwned)

/** Nothing the page shows may have become markup. */
async function expectNoInjectedMarkup(page: Page) {
  await expect(page.locator('img[src="/hostile.png"]')).toHaveCount(0)
  await expect(page.locator('main script')).toHaveCount(0)
  await expect(page.locator('a[href^="javascript:" i]')).toHaveCount(0)
  expect(await executed(page)).toBeUndefined()
}

const hostileDocument = JSON.stringify({
  document: {
    csaf_version: '2.0',
    title: HTML,
    notes: [{ text: SCRIPT, title: SCRIPT_URL }],
    references: [{ url: SCRIPT_URL, summary: MARKDOWN }],
  },
})

const hostileService: MockHandler = (request) => {
  const answer = serviceAnswer({
    mandatoryTest_6_1_1: {
      isValid: false,
      errors: [{ instancePath: `/${HTML}`, message: HTML }],
      warnings: [{ instancePath: '/document', message: SCRIPT }],
    },
    optionalTest_6_2_1: {
      warnings: [{ instancePath: SCRIPT_URL, message: MARKDOWN }],
    },
  })(request) as { body: { tests: unknown[]; isValid: boolean } }
  return {
    body: {
      ...answer.body,
      tests: [
        ...answer.body.tests,
        {
          name: HTML,
          isValid: false,
          errors: [{ instancePath: '/x', message: SCRIPT }],
          warnings: [],
          infos: [],
        },
      ],
    },
  }
}

test.describe('hostile strings are shown as text', () => {
  test('in document values and the document source', async ({ page }) => {
    await page.goto('./')
    await page.getByLabel('CSAF document file').setInputFiles({
      name: `${HTML}.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(hostileDocument),
    })

    const section = page.getByRole('region', { name: 'Document' })
    await expect(section).toContainText(`Source: file “${HTML}.json”`)
    await expect(section.locator('pre')).toContainText(SCRIPT)
    await expect(section.locator('pre')).toContainText(SCRIPT_URL)
    await expectNoInjectedMarkup(page)
  })

  test('in an input error', async ({ page }) => {
    await page.goto('./')
    await page.getByLabel('Document URL').fill(SCRIPT_URL)
    await page.getByRole('button', { name: 'Fetch' }).click()

    await expect(
      page.getByRole('alert').filter({ hasText: 'could not be used' }),
    ).toContainText('Only http: and https: URLs are supported')
    await expectNoInjectedMarkup(page)
  })

  test('in validator messages, locations and test names, in every view', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const service = await mock(hostileService)
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, hostileDocument)
    await runButton(page).click()
    await expectRunCompleted(page)

    await page.getByRole('tab', { name: 'All messages' }).click()
    await expect(page.getByRole('tabpanel')).toContainText(HTML)
    await expect(page.getByRole('tabpanel')).toContainText(SCRIPT)
    await expect(page.getByRole('tabpanel')).toContainText(MARKDOWN)
    await expectNoInjectedMarkup(page)

    await page.getByRole('tab', { name: 'Summary' }).click()
    await expect(page.getByRole('tabpanel')).toContainText(HTML)
    await expectNoInjectedMarkup(page)

    await page.getByRole('tab', { name: 'Detailed report' }).click()
    await expect(page.getByRole('tabpanel')).toContainText(SCRIPT_URL)
    await expectNoInjectedMarkup(page)
  })

  test('in a failure message from the service', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const service = await mock(() => ({
      status: 500,
      body: { message: `${HTML} ${SCRIPT} ${SCRIPT_URL}` },
    }))
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, DOCUMENT_20)
    await runButton(page).click()

    await expect(page.getByRole('alert')).toContainText(HTML)
    await expectNoInjectedMarkup(page)
  })

  test('in hints, in the hint file problems and in the configuration problems', async ({
    page,
    mock,
    runtimeConfig,
    hintFile,
  }) => {
    const service = await mock(hostileService)
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await hintFile(
      [
        'hints:',
        `  - csafVersion: '2.0'`,
        `    section: '6.1.1'`,
        `    text: ${JSON.stringify(`${HTML} ${SCRIPT} ${MARKDOWN} https://evil.example/ ${SCRIPT_URL}`)}`,
        `  - csafVersion: '2.0'`,
        `    section: '6.1.1'`,
        `    validator: csaf-validator-service`,
        `    messageText: ${JSON.stringify(HTML)}`,
        `    text: ${JSON.stringify(`specific ${SCRIPT}`)}`,
      ].join('\n'),
    )
    await openWithText(page, DOCUMENT_20)
    await runButton(page).click()
    await expectRunCompleted(page)

    const hint = page.locator('.hint-text').first()
    await expect(hint).toBeVisible()
    await expect(page.locator('.hint-text').first()).toContainText('specific')
    await expect(page.locator('.hint-text').last()).toContainText(MARKDOWN)
    await expect(page.locator('.hint a')).toHaveCount(0)
    await expectNoInjectedMarkup(page)
  })

  test('in a rejected hint file and a rejected configuration', async ({
    page,
    runtimeConfig,
    hintFile,
  }) => {
    await runtimeConfig({
      version: 1,
      [HTML]: SCRIPT,
      services: { [SCRIPT]: SCRIPT_URL },
      defaults: {},
    })
    await hintFile(
      ['hints:', `  - ${JSON.stringify(HTML)}: ${JSON.stringify(SCRIPT)}`].join(
        '\n',
      ),
    )
    await page.goto('./')

    const notices = page.getByRole('status').filter({ hasText: /not applied/ })
    await expect(notices).toHaveCount(2)
    for (const notice of await notices.all()) {
      await expect(notice).toContainText(HTML)
    }
    await expectNoInjectedMarkup(page)
  })

  test('and every link on the page is an HTTP(S) link', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const service = await mock(hostileService)
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, hostileDocument)
    await runButton(page).click()
    await expectRunCompleted(page)

    for (const tab of ['Summary', 'All messages', 'Detailed report']) {
      await page.getByRole('tab', { name: tab }).click()
      const hrefs = await page
        .locator('a')
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute('href') ?? ''),
        )
      expect(hrefs.length).toBeGreaterThan(0)
      for (const href of hrefs) expect(href).toMatch(/^https?:\/\//)
    }
    for (const link of await page.locator('a').all()) {
      await expect(link).toHaveAttribute('rel', /noopener/)
      await expect(link).toHaveAttribute('target', '_blank')
    }
  })

  test('a typed document keeps its text when it is run and reported', async ({
    page,
  }) => {
    await page.goto('./')
    await useText(page, hostileDocument)
    await expect(page.getByLabel('CSAF document (JSON)')).toHaveValue(
      hostileDocument,
    )
    await expectNoInjectedMarkup(page)
  })
})
