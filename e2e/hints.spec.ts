import {
  DOCUMENT_20,
  expect,
  expectRunCompleted,
  openWithText,
  runButton,
  runState,
  test,
} from './fixtures.ts'
import { serviceAnswer } from './service.ts'

const HINTS = `hints:
  - csafVersion: '2.0'
    section: '6.1.1'
    text: 'General guidance for 6.1.1.'
  - csafVersion: '2.0'
    section: '6.1.1'
    messageText: 'Product is not defined'
    text: 'Guidance for this exact message.'
  - csafVersion: '2.0'
    section: '6.2.1'
    validator: csaf-rs-wasm
    text: 'Only for csaf-rs.'
`

test.beforeEach(async ({ mock, runtimeConfig }) => {
  const service = await mock(
    serviceAnswer({
      mandatoryTest_6_1_1: {
        isValid: false,
        errors: [
          { instancePath: '/product_tree', message: 'Product is not defined' },
        ],
      },
      optionalTest_6_2_1: {
        warnings: [
          { instancePath: '/document', message: 'Language is missing' },
        ],
      },
    }),
  )
  await runtimeConfig({
    version: 1,
    services: { javascript: service.url },
    defaults: { validator: 'csaf-validator-service' },
  })
})

test('a hint appears next to the finding it belongs to, labelled as guidance', async ({
  page,
  hintFile,
}) => {
  await hintFile(HINTS)
  await openWithText(page, DOCUMENT_20)
  await runButton(page).click()
  await expectRunCompleted(page)

  const hints = page
    .getByRole('tabpanel')
    .locator('tr[data-row-id="csaf-2.0/6.1.1"] .hint')
  await expect(hints).toHaveCount(2)
  await expect(hints.first()).toContainText('Guidance for this exact message.')
  await expect(hints.first()).toContainText(
    '(guidance, not a validation result)',
  )
  await expect(hints.first()).toContainText('Supplemental hint')
  await expect(hints.last()).toContainText('General guidance for 6.1.1.')
})

test('a hint never changes a result or a count', async ({ page, hintFile }) => {
  const observe = async () => {
    await openWithText(page, DOCUMENT_20)
    await runButton(page).click()
    await expectRunCompleted(page)
    await page.getByRole('tab', { name: 'All messages' }).click()
    await expect(page.getByRole('tabpanel')).toContainText(
      'Product is not defined',
    )
    const hints = await page.locator('.hint').count()
    await page.getByRole('tab', { name: 'Summary' }).click()
    return {
      counts: await page.locator('dl.counts').textContent(),
      state: await runState(page, 'Run completed').textContent(),
      hints,
    }
  }
  await hintFile(HINTS)
  await page.goto('./')
  const withHints = await observe()

  await hintFile('hints: []\n')
  await page.goto('./')
  const withoutHints = await observe()

  expect(withHints.hints).toBeGreaterThan(0)
  expect(withoutHints.hints).toBe(0)
  expect(withHints.counts).toBe(withoutHints.counts)
  expect(withHints.state).toBe(withoutHints.state)
})

test('a hint for another validator is not shown', async ({
  page,
  hintFile,
}) => {
  await hintFile(HINTS)
  await openWithText(page, DOCUMENT_20)
  await runButton(page).click()
  await expectRunCompleted(page)

  await expect(
    page.getByRole('tabpanel').locator('tr[data-row-id="csaf-2.0/6.2.1"]'),
  ).toBeVisible()
  await expect(
    page
      .getByRole('tabpanel')
      .locator('tr[data-row-id="csaf-2.0/6.2.1"] .hint'),
  ).toHaveCount(0)
})

test('an invalid hint file is rejected as a whole and the report still works', async ({
  page,
  hintFile,
}) => {
  await hintFile(`hints:
  - csafVersion: '2.0'
    section: '6.1.1'
    text: 'A good hint.'
  - csafVersion: '2.0'
    section: '9.9.9'
    text: 'No such section.'
`)
  await openWithText(page, DOCUMENT_20)
  await runButton(page).click()
  await expectRunCompleted(page)

  const notice = page
    .getByRole('status')
    .filter({ hasText: 'Supplemental hints were not applied' })
  await expect(notice).toContainText('rejected as a whole')
  await expect(notice).toContainText(
    'The catalogue of this CSAF version has no such section.',
  )
  await expect(notice).toContainText('Validation and reports are not affected')
  await expect(page.locator('.hint')).toHaveCount(0)
  await expect(page.getByRole('tabpanel')).toContainText(
    'Product is not defined',
  )
})

test('a missing hint file is reported and nothing else changes', async ({
  page,
}) => {
  await page.route('**/hints.yaml', (route) =>
    route.fulfill({ status: 404, body: '' }),
  )
  await openWithText(page, DOCUMENT_20)
  await runButton(page).click()
  await expectRunCompleted(page)

  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Supplemental hints were not applied' }),
  ).toContainText('HTTP 404')
})
