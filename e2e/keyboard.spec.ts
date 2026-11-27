import type { Locator, Page } from '@playwright/test'
import {
  DOCUMENT_20,
  deferred,
  expect,
  minimalDocument,
  openWithText,
  runState,
  startRun,
  test,
} from './fixtures.ts'
import { serviceAnswer } from './service.ts'

/**
 * Moves the focus with Tab, or Shift+Tab when the element comes before the
 * focused one, until it is on the element. Never clicks. Browsers differ in
 * whether Tab wraps around the page, so the direction is not left to them.
 */
async function tabTo(page: Page, target: Locator, limit = 250) {
  const focused = (el: Element) => el === document.activeElement
  const comesBefore = () =>
    target.evaluate((el) => {
      const active = document.activeElement
      return (
        !!active &&
        active !== document.body &&
        !!(
          active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING
        )
      )
    })
  for (const key of (await comesBefore())
    ? ['Shift+Tab', 'Tab']
    : ['Tab', 'Shift+Tab']) {
    for (let presses = 0; presses < limit; presses++) {
      if (await target.evaluate(focused)) return
      await page.keyboard.press(key)
    }
  }
  throw new Error(`The element cannot be reached with the Tab key: ${target}`)
}

const steps = (page: Page) => page.getByRole('navigation', { name: 'Steps' })

/** Reaches a step with the Continue button of the footer, which is also keyboard-operable. */
async function continueWithKeyboard(page: Page) {
  await tabTo(page, page.getByRole('button', { name: 'Continue →' }))
  await page.keyboard.press('Enter')
}

test.describe('input', () => {
  test('pasted text is entered and used from the keyboard', async ({
    page,
  }) => {
    await page.goto('./')
    await tabTo(page, page.getByLabel('CSAF document (JSON)'))
    await page.keyboard.insertText(minimalDocument('2.0'))
    await tabTo(page, page.getByRole('button', { name: 'Use text' }))
    await page.keyboard.press('Enter')

    await expect(steps(page)).toContainText('Pasted JSON · CSAF 2.0')
    await expect(
      page.getByRole('heading', { name: 'Settings for this session' }),
    ).toBeVisible()
  })

  test('the arrow keys switch between the sources', async ({ page }) => {
    await page.goto('./')
    const source = (name: string) => page.getByRole('tab', { name })
    await tabTo(page, source('Paste JSON'))
    await expect(source('Open a file')).toHaveAttribute('tabindex', '-1')

    await page.keyboard.press('ArrowRight')
    await expect(source('Open a file')).toBeFocused()
    await expect(source('Open a file')).toHaveAttribute('aria-selected', 'true')
    await tabTo(page, page.getByLabel('CSAF document file'))

    await source('Open a file').focus()
    await page.keyboard.press('ArrowRight')
    await expect(source('Fetch from a URL')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(source('Paste JSON')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(source('Fetch from a URL')).toBeFocused()
  })

  test('a URL is entered and fetched from the keyboard', async ({
    page,
    mock,
  }) => {
    const host = await mock(() => ({ body: JSON.parse(DOCUMENT_20) }))
    await page.goto('./')
    // The sources are one tab stop. The arrow keys move between them.
    await tabTo(page, page.getByRole('tab', { name: 'Paste JSON' }))
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await tabTo(page, page.getByLabel('Document URL'))
    await page.keyboard.insertText(`${host.url}/doc.json`)
    await tabTo(page, page.getByRole('button', { name: 'Fetch' }))
    await page.keyboard.press('Space')

    await expect(steps(page)).toContainText(`${host.url}/doc.json · CSAF 2.0`)
  })
})

test.describe('selection', () => {
  test('the validator and the version are chosen with the arrow keys', async ({
    page,
  }) => {
    await openWithText(page, DOCUMENT_20)
    const validator = page.getByLabel('Validator', { exact: true })
    await tabTo(page, validator)
    await expect(validator).toHaveValue('csaf-validator-lib')
    await page.keyboard.press('ArrowDown')
    await expect(validator).toHaveValue('csaf-validator-service')

    const version = page.getByLabel('CSAF version', { exact: true })
    await tabTo(page, version)
    await expect(version).toHaveValue('document')
    await page.keyboard.press('ArrowDown')
    await expect(version).toHaveValue('2.0')
  })

  test('tests and the schema check are toggled with the space bar', async ({
    page,
  }) => {
    await openWithText(page, DOCUMENT_20)
    const schema = page.getByLabel('Validate against the CSAF JSON schema')
    await tabTo(page, schema)
    await expect(schema).toBeChecked()
    await page.keyboard.press('Space')
    await expect(schema).not.toBeChecked()

    const test = page.getByRole('checkbox', { name: /^Select 6\.1\.1 / })
    await tabTo(page, test)
    await expect(test).toBeChecked()
    await page.keyboard.press('Space')
    await expect(test).not.toBeChecked()
  })

  test('the selection is reset with the keyboard', async ({ page }) => {
    await openWithText(page, DOCUMENT_20)
    const test = page.getByRole('checkbox', { name: /^Select 6\.1\.1 / })
    await test.uncheck()

    await tabTo(
      page,
      page.getByRole('button', { name: 'Reset to the initial selection' }),
    )
    await page.keyboard.press('Enter')
    await expect(test).toBeChecked()
  })

  test('the steps are changed with the keyboard', async ({ page }) => {
    await openWithText(page, DOCUMENT_20)
    await continueWithKeyboard(page)
    await expect(
      page.getByRole('button', { name: 'Run selected tests' }),
    ).toBeVisible()

    await tabTo(page, page.getByRole('button', { name: '← Back' }))
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('heading', { name: 'Test selection' }),
    ).toBeVisible()

    await tabTo(page, steps(page).getByRole('button', { name: /^Document/ }))
    await page.keyboard.press('Space')
    await expect(
      page.getByRole('heading', { name: 'Provide a document' }),
    ).toBeVisible()
  })
})

test.describe('run and cancel', () => {
  test('a run is started and cancelled from the keyboard', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const gate = deferred()
    const answer = serviceAnswer()
    const service = await mock(async (request) => {
      await gate.released
      return answer(request)
    })
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, DOCUMENT_20)
    await continueWithKeyboard(page)

    await tabTo(page, page.getByRole('button', { name: 'Run selected tests' }))
    await page.keyboard.press('Enter')
    await expect(runState(page, 'Running')).toBeVisible()

    // Starting the run disables its button, so the focus is not on it any more.
    await tabTo(page, page.getByRole('button', { name: 'Cancel run' }))
    await page.keyboard.press('Enter')
    await expect(runState(page, 'Run cancelled')).toBeVisible()
    gate.release()
  })

  test('the network confirmation is answered from the keyboard', async ({
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
    await page.getByRole('checkbox', { name: /^Select 6\.3\.6 / }).check()
    await continueWithKeyboard(page)
    await tabTo(page, page.getByRole('button', { name: 'Run selected tests' }))
    await page.keyboard.press('Enter')

    await tabTo(page, page.getByRole('button', { name: 'Do not run' }))
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(service.requests).toEqual([])
  })
})

test.describe('the report tabs', () => {
  test.beforeEach(async ({ page, mock, runtimeConfig }) => {
    const service = await mock(serviceAnswer())
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, DOCUMENT_20)
    await startRun(page)
    await expect(runState(page, 'Run completed')).toBeVisible()
  })

  test('only the selected tab is in the Tab order, and the arrows move between tabs', async ({
    page,
  }) => {
    const tab = (name: string) => page.getByRole('tab', { name })
    await expect(tab('All messages')).toHaveAttribute('tabindex', '0')
    await expect(tab('Summary')).toHaveAttribute('tabindex', '-1')

    await tabTo(page, tab('All messages'))
    await page.keyboard.press('ArrowRight')
    await expect(tab('Detailed report')).toBeFocused()
    await expect(tab('Detailed report')).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await page.keyboard.press('ArrowRight')
    await expect(tab('Summary')).toBeFocused()
    await expect(tab('Summary')).toHaveAttribute('aria-selected', 'true')

    await page.keyboard.press('ArrowLeft')
    await expect(tab('Detailed report')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(tab('All messages')).toBeFocused()
    await expect(page.getByRole('tabpanel')).toBeVisible()
  })

  test('Tab leaves the tab list for the report instead of the other tabs', async ({
    page,
  }) => {
    await tabTo(page, page.getByRole('tab', { name: 'All messages' }))
    await page.keyboard.press('Tab')

    await expect(
      page.getByRole('tab', { name: 'Detailed report' }),
    ).not.toBeFocused()
    await expect(page.getByRole('tab', { name: 'Summary' })).not.toBeFocused()
    await expect(
      page.getByRole('tab', { name: 'All messages' }),
    ).not.toBeFocused()
  })
})
