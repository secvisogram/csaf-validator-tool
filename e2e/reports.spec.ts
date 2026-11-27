import type { Page } from '@playwright/test'
import {
  DOCUMENT_20,
  chooseValidator,
  goToStep,
  useText,
  expect,
  expectRunCompleted,
  openWithText,
  startRun,
  runState,
  test,
} from './fixtures.ts'
import type { MockHandler } from './mock.ts'
import { serviceAnswer } from './service.ts'

const row = (page: Page, section: string) =>
  page.getByRole('tabpanel').locator(`tr[data-row-id="csaf-2.0/${section}"]`)
const count = (page: Page, key: string) =>
  page.locator(`[data-count="${key}"] dd`)

const mixed: MockHandler = (request) => {
  const answer = serviceAnswer({
    mandatoryTest_6_1_1: {
      isValid: false,
      errors: [
        { instancePath: '/product_tree/x', message: 'Product is not defined' },
      ],
      warnings: [
        { instancePath: '/document', message: 'A warning on the failure' },
      ],
    },
    optionalTest_6_2_1: {
      warnings: [
        { instancePath: '/document/lang', message: 'Language is missing' },
      ],
    },
    informativeTest_6_3_1: {
      infos: [
        { instancePath: '/document', message: 'Only for your information' },
      ],
    },
  })(request) as { body: { tests: { name: string }[]; isValid: boolean } }
  return {
    body: {
      ...answer.body,
      // One requested test gets no answer, and one answer matches no catalogue test.
      tests: [
        ...answer.body.tests.filter(
          (test) => test.name !== 'mandatoryTest_6_1_2',
        ),
        {
          name: 'someUnknownTest',
          isValid: true,
          errors: [],
          warnings: [],
          infos: [],
        },
      ],
    },
  }
}

test.describe('a finished run', () => {
  test.beforeEach(async ({ page, mock, runtimeConfig }) => {
    const service = await mock(mixed)
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, DOCUMENT_20)
    await startRun(page)
    await expect(runState(page, 'Run completed')).toBeVisible()
  })

  test('opens on the configured view and keeps the validator flag apart from any verdict', async ({
    page,
  }) => {
    await expect(
      page.getByRole('tab', { name: 'All messages' }),
    ).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Report' })).toContainText(
      'The validator reported isValid: false for the whole request.',
    )
    await expect(
      page.getByText('No single pass or fail verdict is inferred.'),
    ).toBeVisible()
  })

  test('the summary counts every kind of outcome separately', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Summary' }).click()

    await expect(count(page, 'failed')).toHaveText('1')
    await expect(count(page, 'missing')).toHaveText('1')
    await expect(count(page, 'uncatalogued')).toHaveText('1')
    await expect(count(page, 'notSelected')).not.toHaveText('0')
    await expect(count(page, 'succeeded')).not.toHaveText('0')
    await expect(
      page.getByText('Returned messages: 1 errors, 2 warnings, 1 information.'),
    ).toBeVisible()

    const attention = page.locator('ul.attention')
    await expect(
      attention.locator('[data-row-id="csaf-2.0/6.1.1"]'),
    ).toContainText('Not valid')
    await expect(
      attention.locator('[data-row-id="csaf-2.0/6.1.2"]'),
    ).toContainText('Missing result')
    await expect(attention.locator('[data-uncatalogued]')).toContainText(
      'someUnknownTest',
    )
  })

  test('all messages lists every returned message with its location', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'All messages' }).click()

    const failed = row(page, '6.1.1')
    await expect(failed).toHaveCount(2)
    await expect(failed.first()).toContainText('Product is not defined')
    await expect(failed.first()).toContainText('/product_tree/x')
    await expect(failed.nth(1)).toContainText('A warning on the failure')
    await expect(row(page, '6.2.1')).toContainText('Language is missing')
    await expect(row(page, '6.3.1')).toContainText('Only for your information')
    await expect(row(page, '6.1.2')).toContainText('Missing result')
    await expect(row(page, '6.1.3')).toHaveCount(0)
  })

  test('the detailed report has a row for every catalogue test with its own state', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Detailed report' }).click()

    await expect(row(page, '6.1.1')).toHaveAttribute('data-status', 'failed')
    await expect(row(page, '6.1.2')).toHaveAttribute('data-status', 'missing')
    await expect(row(page, '6.1.3')).toHaveAttribute('data-status', 'succeeded')
    await expect(row(page, '6.3.6')).toHaveAttribute(
      'data-status',
      'not-selected',
    )
    await expect(row(page, '6.3.6')).toContainText('No')
    await expect(row(page, '6.1.3')).toContainText('Yes')
    await expect(
      page.getByRole('heading', { name: 'Uncatalogued results' }),
    ).toBeVisible()
    await expect(
      page.getByRole('cell', { name: 'someUnknownTest', exact: true }),
    ).toBeVisible()
  })

  test('switching views keeps the same run', async ({ page }) => {
    const state = runState(page, 'Run completed')
    const before = await state.innerText()
    for (const name of ['Summary', 'Detailed report', 'All messages']) {
      await page.getByRole('tab', { name }).click()
      await expect(page.getByRole('tab', { name })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(state).toHaveText(before)
    }
  })
})

test('a new document discards the report of the previous one', async ({
  page,
  mock,
  runtimeConfig,
}) => {
  const service = await mock(serviceAnswer())
  await runtimeConfig({
    version: 1,
    services: { javascript: service.url },
    defaults: { validator: 'csaf-validator-service' },
  })
  await openWithText(page, DOCUMENT_20)
  await startRun(page)
  await expect(page.getByRole('region', { name: 'Report' })).toBeVisible()

  await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible()

  await useText(page, '{"document":{"csaf_version":"2.0"}}')
  await goToStep(page, 'Run & report')

  await expect(page.getByRole('region', { name: 'Report' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveCount(0)
})

test('a validator that skips tests is shown as skipped, not as valid', async ({
  page,
}) => {
  // csaf-rs skips most tests when the document fails the schema check.
  await openWithText(
    page,
    JSON.stringify({ document: { csaf_version: '2.0' } }),
  )
  await chooseValidator(page, 'csaf-rs (WASM), in this browser')
  await startRun(page)
  await expectRunCompleted(page)
  await page.getByRole('tab', { name: 'Summary' }).click()

  await expect(count(page, 'skipped')).not.toHaveText('0')
  await expect(count(page, 'failed')).not.toHaveText('0')
  await page.getByRole('tab', { name: 'Detailed report' }).click()
  await expect(
    page.getByRole('tabpanel').locator('tr[data-status="skipped"]').first(),
  ).toContainText('Skipped')
})
