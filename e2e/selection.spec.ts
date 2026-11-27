import type { Page } from '@playwright/test'
import {
  DOCUMENT_20,
  chooseVersion,
  DOCUMENT_21,
  expect,
  expectRunCompleted,
  minimalDocument,
  openWithText,
  startRun,
  test,
  useText,
} from './fixtures.ts'
import { sentTests, serviceAnswer } from './service.ts'

const summary = (page: Page) => page.getByText(/ of \d+ tests selected, /)
const selectTest = (page: Page, section: string) =>
  page.getByRole('checkbox', { name: new RegExp(`^Select ${section} `) })

test.describe('the CSAF version', () => {
  test('follows the version the document declares', async ({ page }) => {
    await openWithText(page, DOCUMENT_20)
    await expect(
      page.getByText('CSAF 2.0 (OASIS Standard), as declared in the document'),
    ).toBeVisible()

    await useText(page, DOCUMENT_21)
    await expect(
      page.getByText('CSAF 2.1 (CSD04), as declared in the document'),
    ).toBeVisible()
    await expect(
      page.getByText('experimental committee specification draft'),
    ).toBeVisible()
  })

  test('can be chosen explicitly against the declared version', async ({
    page,
  }) => {
    await openWithText(page, DOCUMENT_20)
    await chooseVersion(page, '2.1')

    await expect(
      page.getByText('CSAF 2.1 (CSD04), chosen explicitly'),
    ).toBeVisible()
  })

  test('cannot be looked at before a document is loaded', async ({ page }) => {
    await page.goto('./')
    const steps = page.getByRole('navigation', { name: 'Steps' })

    await expect(steps.getByRole('button', { name: /^Tests/ })).toBeDisabled()
    await expect(
      steps.getByRole('button', { name: /^Run & report/ }),
    ).toBeDisabled()
    await expect(selectTest(page, '6.1.1')).toHaveCount(0)
  })

  test('has to be chosen when the document declares none', async ({ page }) => {
    await openWithText(page, minimalDocument(null))
    await expect(page.getByText('so no catalogue is shown')).toBeVisible()

    await chooseVersion(page, '2.0')
    await expect(selectTest(page, '6.1.1')).toBeVisible()
  })
})

test.describe('the test selection', () => {
  test('starts with the external-request-free tests and the schema check', async ({
    page,
  }) => {
    await openWithText(page, DOCUMENT_20)

    await expect(selectTest(page, '6.1.1')).toBeChecked()
    await expect(selectTest(page, '6.3.6')).not.toBeChecked()
    await expect(selectTest(page, '6.3.7')).not.toBeChecked()
    await expect(
      page.getByLabel('Validate against the CSAF JSON schema'),
    ).toBeChecked()
    await expect(summary(page)).toContainText('schema check selected')
  })

  test('is edited test by test and restored by a reset', async ({ page }) => {
    await openWithText(page, DOCUMENT_20)
    const initial = await summary(page).innerText()

    await selectTest(page, '6.1.1').uncheck()
    await selectTest(page, '6.3.6').check()
    await page.getByLabel('Validate against the CSAF JSON schema').uncheck()
    await expect(summary(page)).toContainText('schema check not selected')
    await expect(summary(page)).not.toHaveText(initial)

    await page
      .getByRole('button', { name: 'Reset to the initial selection' })
      .click()
    await expect(summary(page)).toHaveText(initial)
    await expect(selectTest(page, '6.1.1')).toBeChecked()
    await expect(selectTest(page, '6.3.6')).not.toBeChecked()
  })

  test('is kept for each version while switching between them', async ({
    page,
  }) => {
    await openWithText(page, DOCUMENT_20)
    await selectTest(page, '6.1.1').uncheck()

    await chooseVersion(page, '2.1')
    await expect(selectTest(page, '6.1.1')).toBeChecked()

    await chooseVersion(page, '2.0')
    await expect(selectTest(page, '6.1.1')).not.toBeChecked()
  })

  test('runs exactly the tests that are checked', async ({
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
    await page.getByLabel('Validate against the CSAF JSON schema').uncheck()
    for (const box of await page
      .getByRole('checkbox', { name: /^Select / })
      .all()) {
      await box.uncheck()
    }
    await selectTest(page, '6.1.2').check()
    await selectTest(page, '6.2.1').check()
    await startRun(page)

    await expectRunCompleted(page)
    const tests = sentTests(service)
    expect(tests.sort()).toEqual(['mandatoryTest_6_1_2', 'optionalTest_6_2_1'])
  })
})

test.describe('a test that may reach external resources', () => {
  const setup = async (page: Page, serviceUrl: string) => {
    await page.route(
      '**/.well-known/appspecific/runtime-config.json',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            version: 1,
            services: { javascript: serviceUrl },
            defaults: { validator: 'csaf-validator-service' },
          }),
        }),
    )
    await openWithText(page, DOCUMENT_20)
    await selectTest(page, '6.3.6').check()
  }

  test('is sent only after the user confirms', async ({ page, mock }) => {
    const service = await mock(serviceAnswer())
    await setup(page, service.url)
    await startRun(page)

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(
      'Some selected tests may access external resources',
    )
    await expect(dialog).toContainText('6.3.6')
    expect(service.requests).toEqual([])

    await dialog
      .getByRole('button', { name: 'Run including these tests' })
      .click()
    await expectRunCompleted(page)
    const tests = sentTests(service)
    expect(tests).toContain('informativeTest_6_3_6')
  })

  test('is not sent when the user declines', async ({ page, mock }) => {
    const service = await mock(serviceAnswer())
    await setup(page, service.url)
    await startRun(page)
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Do not run' })
      .click()

    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Report' })).toHaveCount(0)
    expect(service.requests).toEqual([])
  })
})
