import {
  DOCUMENT_20,
  documentSection,
  expect,
  fetchUrl,
  goToStep,
  minimalDocument,
  test,
  useFile,
  useText,
} from './fixtures.ts'

const intakeError = (page: import('@playwright/test').Page) =>
  page.getByRole('alert').filter({ hasText: 'The document could not be used' })

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test.describe('pasted text', () => {
  test('is shown with its source and declared version', async ({ page }) => {
    await useText(page, DOCUMENT_20)

    await expect(await documentSection(page)).toContainText(
      'Source: pasted text',
    )
    await expect(await documentSection(page)).toContainText(
      'Declared CSAF version: 2.0',
    )
    await expect((await documentSection(page)).locator('pre')).toContainText(
      'OASIS_CSAF_TC-CSAF_2.0-2021-6-1-01-11',
    )
  })

  test('that is not JSON names the syntax problem', async ({ page }) => {
    await useText(page, '{ "document": ')

    await expect(intakeError(page)).toContainText('The input is not valid JSON')
    await expect(await documentSection(page)).toHaveCount(0)
  })

  test('that is empty is refused', async ({ page }) => {
    await useText(page, '   ')

    await expect(intakeError(page)).toContainText('The input is empty')
  })

  for (const [json, kind] of [
    ['[1, 2]', 'an array'],
    ['"text"', 'a string'],
    ['42', 'a number'],
    ['true', 'a boolean'],
    ['null', 'null'],
  ]) {
    test(`with ${kind} at the top level is refused`, async ({ page }) => {
      await useText(page, json as string)

      await expect(intakeError(page)).toContainText(
        `The JSON top level must be an object, but it is ${kind}`,
      )
    })
  }

  test('without a declared version is kept, and no catalogue is shown', async ({
    page,
  }) => {
    await useText(page, minimalDocument(null))

    await expect(await documentSection(page)).toContainText(
      'does not declare a CSAF version',
    )
    await goToStep(page, 'Tests')
    await expect(
      page.getByRole('alert').filter({ hasText: 'no catalogue is shown' }),
    ).toBeVisible()
  })

  test('with an unsupported version is kept, and no catalogue is shown', async ({
    page,
  }) => {
    await useText(page, minimalDocument('1.0'))

    await expect(await documentSection(page)).toContainText(
      '“1.0” is not supported',
    )
  })

  test('a second document replaces the first', async ({ page }) => {
    await useText(page, DOCUMENT_20)
    await useText(page, minimalDocument('2.1'))

    await expect(await documentSection(page)).toContainText(
      'Declared CSAF version: 2.1',
    )
    await expect(await documentSection(page)).not.toContainText('OASIS_CSAF_TC')
  })
})

test.describe('a file', () => {
  test('is read in the browser and shown with its name', async ({ page }) => {
    await useFile(page, {
      name: 'advisory.json',
      mimeType: 'application/json',
      buffer: Buffer.from(DOCUMENT_20),
    })

    await expect(await documentSection(page)).toContainText(
      'Source: file “advisory.json”',
    )
    await expect(await documentSection(page)).toContainText(
      'Declared CSAF version: 2.0',
    )
  })

  test('that is not JSON is refused', async ({ page }) => {
    await useFile(page, {
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not json'),
    })

    await expect(intakeError(page)).toContainText('The input is not valid JSON')
  })
})

test.describe('a URL', () => {
  test('is fetched by the browser and shown with its address', async ({
    page,
    mock,
  }) => {
    const host = await mock(() => ({ body: JSON.parse(DOCUMENT_20) }))
    await fetchUrl(page, `${host.url}/advisory.json`)

    await expect(await documentSection(page)).toContainText(
      `Source: ${host.url}/advisory.json`,
    )
    await expect(await documentSection(page)).toContainText(
      'Declared CSAF version: 2.0',
    )
    expect(host.requests.map((r) => r.path)).toEqual(['/advisory.json'])
  })

  test('sends no cookies or credentials', async ({ page, context, mock }) => {
    const host = await mock(() => ({ body: JSON.parse(DOCUMENT_20) }))
    await context.addCookies([
      { name: 'session', value: 'secret', url: `${host.url}/` },
    ])
    const cookies: (string | undefined)[] = []
    await page.route(`${host.url}/**`, async (route) => {
      cookies.push(route.request().headers()['cookie'])
      await route.continue()
    })
    // Control: the cookie really is sent when a request asks for credentials.
    await page.evaluate(
      (url) => fetch(url, { mode: 'no-cors', credentials: 'include' }),
      `${host.url}/control`,
    )
    expect(cookies).toEqual(['session=secret'])

    await fetchUrl(page, `${host.url}/advisory.json`)

    await expect(await documentSection(page)).toBeVisible()
    expect(cookies).toHaveLength(2)
    expect(cookies[1]).toBeUndefined()
  })

  test('answered with an HTTP error is refused with the status', async ({
    page,
    mock,
  }) => {
    const host = await mock(() => ({ status: 404, body: 'nothing here' }))
    await fetchUrl(page, `${host.url}/missing.json`)

    await expect(intakeError(page)).toContainText('HTTP status 404')
    await expect(intakeError(page)).toContainText('Use the text or file input')
  })

  test('without CORS headers fails with guidance and no stated cause', async ({
    page,
    mock,
  }) => {
    const host = await mock(() => ({ body: JSON.parse(DOCUMENT_20) }), {
      cors: false,
    })
    await fetchUrl(page, `${host.url}/advisory.json`)

    await expect(intakeError(page)).toContainText(
      'The document could not be fetched.',
    )
    await expect(intakeError(page)).toContainText(
      'CORS, network, and permission',
    )
    await expect(intakeError(page)).toContainText('Use the text or file input')
  })

  test('that is not JSON is refused', async ({ page, mock }) => {
    const host = await mock(() => ({ body: '<html>not json</html>' }))
    await fetchUrl(page, `${host.url}/page.html`)

    await expect(intakeError(page)).toContainText('The input is not valid JSON')
  })

  for (const [url, message] of [
    ['not a url', 'The URL is not a valid absolute URL.'],
    ['ftp://example.org/a.json', 'Only http: and https: URLs are supported'],
    [
      'https://user:pass@example.org/a.json',
      'The URL must not contain a user name or password.',
    ],
  ]) {
    test(`${url} is refused before any request`, async ({
      page,
      requested,
    }) => {
      await fetchUrl(page, url as string)

      await expect(intakeError(page)).toContainText(message as string)
      expect(requested.filter((u) => u.includes('example.org'))).toEqual([])
    })
  }
})
