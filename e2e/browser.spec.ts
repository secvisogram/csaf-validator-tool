import { appendFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('records the exact browser version of this run', async ({
  browser,
  browserName,
}, testInfo) => {
  const version = browser.version()
  expect(version).toMatch(/^\d+(\.\d+)+$/)

  const line = `${testInfo.project.name}: ${browserName} ${version}`
  testInfo.annotations.push({ type: 'browser', description: line })
  console.log(`Browser under test: ${line}`)
  if (process.env['GITHUB_STEP_SUMMARY']) {
    appendFileSync(
      process.env['GITHUB_STEP_SUMMARY'],
      `### Browser under test\n\n${line}\n`,
    )
  }
})

test('chrome runs the installed stable Chrome, not the bundled Chromium', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome')
  await page.goto('./')
  const brands = await page.evaluate(
    () =>
      (
        navigator as unknown as {
          userAgentData?: { brands: { brand: string }[] }
        }
      ).userAgentData?.brands.map((entry) => entry.brand) ?? [],
  )
  expect(brands).toContain('Google Chrome')
})
