import type { Locator, Page } from '@playwright/test'
import {
  DOCUMENT_20,
  deferred,
  expect,
  minimalDocument,
  runState,
  test,
} from './fixtures.ts'
import { serviceAnswer } from './service.ts'

/** Moves the focus with the Tab key until it is on the element. Never clicks. */
async function tabTo(page: Page, target: Locator, limit = 600) {
  for (let presses = 0; presses < limit; presses++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`The element cannot be reached with the Tab key: ${target}`)
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

    await expect(page.getByRole('region', { name: 'Document' })).toContainText(
      'Declared CSAF version: 2.0',
    )
  })

  test('a URL is entered and fetched from the keyboard', async ({
    page,
    mock,
  }) => {
    const host = await mock(() => ({ body: JSON.parse(DOCUMENT_20) }))
    await page.goto('./')
    await tabTo(page, page.getByLabel('Document URL'))
    await page.keyboard.insertText(`${host.url}/doc.json`)
    await tabTo(page, page.getByRole('button', { name: 'Fetch' }))
    await page.keyboard.press('Space')

    await expect(page.getByRole('region', { name: 'Document' })).toContainText(
      `Source: ${host.url}/doc.json`,
    )
  })

  test('the file chooser can be focused', async ({ page }) => {
    await page.goto('./')
    await tabTo(page, page.getByLabel('CSAF document file'))
  })
})

test.describe('selection', () => {
  test('the validator and the version are chosen with the arrow keys', async ({
    page,
  }) => {
    await page.goto('./')
    await tabTo(
      page,
      page.getByRole('radio', { name: 'csaf-validator-lib, in this browser' }),
    )
    await page.keyboard.press('ArrowDown')
    await expect(
      page.getByRole('radio', {
        name: 'csaf-validator-service (JavaScript service)',
      }),
    ).toBeChecked()

    await tabTo(
      page,
      page.getByRole('radio', {
        name: 'Use the version declared in the document (default)',
      }),
    )
    await page.keyboard.press('ArrowDown')
    await expect(
      page.getByRole('radio', { name: 'CSAF 2.0 (OASIS Standard)' }),
    ).toBeChecked()
  })

  test('tests and the schema check are toggled with the space bar', async ({
    page,
  }) => {
    await page.goto('./')
    await page.getByRole('radio', { name: 'CSAF 2.0 (OASIS Standard)' }).check()
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
    await page.goto('./')
    await page.getByRole('radio', { name: 'CSAF 2.0 (OASIS Standard)' }).check()
    const test = page.getByRole('checkbox', { name: /^Select 6\.1\.1 / })
    await test.uncheck()

    await tabTo(
      page,
      page.getByRole('button', { name: 'Reset to the initial selection' }),
    )
    await page.keyboard.press('Enter')
    await expect(test).toBeChecked()
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
    await page.goto('./')
    await page.getByLabel('CSAF document (JSON)').fill(DOCUMENT_20)
    await tabTo(page, page.getByRole('button', { name: 'Use text' }))
    await page.keyboard.press('Enter')

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
    await page.goto('./')
    await page.getByLabel('CSAF document (JSON)').fill(DOCUMENT_20)
    await page.getByRole('button', { name: 'Use text' }).click()
    await page.getByRole('checkbox', { name: /^Select 6\.3\.6 / }).check()
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
    await page.goto('./')
    await page.getByLabel('CSAF document (JSON)').fill(DOCUMENT_20)
    await page.getByRole('button', { name: 'Use text' }).click()
    await page.getByRole('button', { name: 'Run selected tests' }).click()
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
