import {
  DOCUMENT_20,
  chooseValidator,
  deferred,
  expect,
  openWithText,
  runButton,
  runState,
  test,
} from './fixtures.ts'
import { sentTests, serviceAnswer } from './service.ts'

test.describe('a JavaScript validator service', () => {
  test('receives the document and its results are shown as returned', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const service = await mock(
      serviceAnswer({
        mandatoryTest_6_1_1: {
          isValid: false,
          errors: [
            { instancePath: '/product_tree', message: 'Missing definition' },
          ],
        },
      }),
    )
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, DOCUMENT_20)

    await expect(
      page.getByText(`Destination: ${service.url}/api/v1/validate`),
    ).toBeVisible()
    await runButton(page).click()

    await expect(runState(page, 'Run completed')).toBeVisible()
    expect(service.requests).toHaveLength(1)
    const [request] = service.requests
    expect(request?.method).toBe('POST')
    expect(request?.path).toBe('/api/v1/validate')
    expect(request?.body).toMatchObject({ document: JSON.parse(DOCUMENT_20) })
    await page.getByRole('tab', { name: 'All messages' }).click()
    const panel = page.getByRole('tabpanel')
    await expect(
      panel.getByRole('cell', { name: 'Missing definition', exact: true }),
    ).toBeVisible()
    await expect(panel.getByText('/product_tree')).toBeVisible()
  })

  test('discloses where the document goes before anything is sent', async ({
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

    const disclosure = page.getByRole('region', {
      name: 'Where the document goes',
    })
    await expect(disclosure).toContainText(
      `Destination: ${service.url}/api/v1/validate`,
    )
    await expect(disclosure).toContainText(
      'Running sends the complete document and the request parameters to this service.',
    )
    await expect(disclosure).toContainText(
      'The operator of the service controls retention and logging.',
    )
    expect(service.requests).toEqual([])
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  })

  test('shows no destination for a validator that runs in the browser', async ({
    page,
  }) => {
    await openWithText(page, DOCUMENT_20)

    await expect(
      page.getByRole('region', { name: 'Where the document goes' }),
    ).toHaveCount(0)
    await expect(
      page.getByText('Runs in this browser in a Web Worker.').first(),
    ).toBeVisible()
  })

  test('a service error ends the run without any test result', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const service = await mock(() => ({
      status: 500,
      body: { message: 'The validator crashed' },
    }))
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, DOCUMENT_20)
    await runButton(page).click()

    await expect(runState(page, 'Run failed')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('HTTP 500')
    await expect(page.getByRole('alert')).toContainText('The validator crashed')
    await expect(runState(page, 'Run failed')).toContainText(
      /0 of \d+ selected tests returned a result/,
    )
  })

  for (const [name, answer] of [
    ['an unexpected JSON shape', { body: { unexpected: true } }],
    ['text instead of JSON', { body: 'not json at all' }],
  ] as const) {
    test(`${name} is a run failure, not a test result`, async ({
      page,
      mock,
      runtimeConfig,
    }) => {
      const service = await mock(() => answer)
      await runtimeConfig({
        version: 1,
        services: { javascript: service.url },
        defaults: { validator: 'csaf-validator-service' },
      })
      await openWithText(page, DOCUMENT_20)
      await runButton(page).click()

      await expect(runState(page, 'Run failed')).toContainText(
        /0 of \d+ selected tests returned a result/,
      )
      await expect(page.getByRole('alert')).toContainText(
        'the response cannot be used',
      )
    })
  }

  test('cancelling keeps no result, and the run stays cancelled when the service answers later', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const gate = deferred()
    const answer = serviceAnswer()
    let answered = false
    const service = await mock(async (request) => {
      await gate.released
      answered = true
      return answer(request)
    })
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, DOCUMENT_20)
    await runButton(page).click()
    await expect(
      page.getByText('Cancelling aborts the browser request.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Cancel run' }).click()

    await expect(runState(page, 'Run cancelled')).toContainText(
      /0 of \d+ selected tests returned a result before the run was cancelled/,
    )
    gate.release()
    await expect.poll(() => answered).toBe(true)
    await expect(runState(page, 'Run cancelled')).toBeVisible()
    await expect(runState(page, 'Run completed')).toHaveCount(0)
  })

  test('an unreachable service is a run failure that names the endpoint', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const service = await mock(() => ({ body: {} }), { cors: false })
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service' },
    })
    await openWithText(page, DOCUMENT_20)
    await runButton(page).click()

    await expect(runState(page, 'Run failed')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText(
      `No response was received from ${service.url}/api/v1/validate`,
    )
  })
})

test.describe('the validator library in a worker', () => {
  test('shows progress, and cancelling keeps what was returned', async ({
    page,
  }) => {
    // The library answers all tests within a few milliseconds, so the page
    // drops every worker message after the first result, as if the worker
    // were slow. The run is then cancelled with exactly one result received.
    await page.addInitScript(() => {
      const Native = window.Worker
      const onmessage = Object.getOwnPropertyDescriptor(
        Native.prototype,
        'onmessage',
      )
      if (!onmessage?.set || !onmessage.get) throw new Error('no onmessage')
      const { get, set } = onmessage
      window.Worker = class extends Native {
        constructor(...args: ConstructorParameters<typeof Native>) {
          super(...args)
          let results = 0
          Object.defineProperty(this, 'onmessage', {
            configurable: true,
            get: () => get.call(this),
            set: (handler: ((event: MessageEvent) => void) | null) => {
              set.call(
                this,
                handler &&
                  ((event: MessageEvent) => {
                    if (results >= 1) return
                    if (event.data?.type === 'test-result') results++
                    handler.call(this, event)
                  }),
              )
            },
          })
        }
      }
    })
    await openWithText(page, DOCUMENT_20)
    await runButton(page).click()
    await expect(runState(page, 'Running')).toBeVisible()
    await expect(page.getByText(/1 of \d+ tests finished/)).toBeVisible({
      timeout: 60_000,
    })
    await page.getByRole('button', { name: 'Cancel run' }).click()

    await expect(runState(page, 'Run cancelled')).toHaveText(
      /Run cancelled\s+1 of \d+ selected tests returned a result before the run was cancelled/,
    )
    await page.getByRole('tab', { name: 'Detailed report' }).click()
    await expect(
      page.getByRole('tabpanel').getByText('Not run — cancelled').first(),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel run' })).toHaveCount(
      0,
    )
  })
})

test.describe('a Rust validator service', () => {
  test('is sent canonical test names and its results carry the flattening notice', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const service = await mock(serviceAnswer())
    await runtimeConfig({
      version: 1,
      services: { rust: service.url },
      defaults: { validator: 'csaf-service' },
    })
    await openWithText(page, DOCUMENT_20)
    await runButton(page).click()

    await expect(runState(page, 'Run completed')).toBeVisible()
    expect(service.requests).toHaveLength(1)
    expect(service.requests[0]?.path).toBe('/api/v1/validate')
    const tests = sentTests(service)
    expect(tests.length).toBeGreaterThan(0)
    for (const name of tests) expect(name).toMatch(/^(schema|\d+(\.\d+)+)$/)
    await expect(page.getByRole('region', { name: 'Report' })).toContainText(
      'computed from flattened results',
    )
  })

  test('is not sent a document whose declared version differs from the selection', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const service = await mock(serviceAnswer())
    await runtimeConfig({
      version: 1,
      services: { rust: service.url },
      defaults: { validator: 'csaf-service', csafVersion: '2.1' },
    })
    await openWithText(page, DOCUMENT_20)
    await runButton(page).click()

    await expect(runState(page, 'Run failed')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('nothing was sent')
    expect(service.requests).toEqual([])
  })
})

test.describe('csaf-rs WebAssembly in a worker', () => {
  test('validates a schema-valid document, with no per-test progress', async ({
    page,
  }) => {
    await openWithText(page, DOCUMENT_20)
    await chooseValidator(page, 'csaf-rs (WASM), in this browser')
    await runButton(page).click()

    await expect(page.getByText(/cannot report progress/)).toBeVisible()
    await expect(runState(page, 'Run completed')).toHaveText(
      /Run completed\s+[1-9]\d* of \d+ selected tests returned a result/,
    )
  })

  test('cancelling discards the whole run and says so', async ({ page }) => {
    // The module load is held, so the run is still going when it is cancelled.
    const gate = deferred()
    await page.route('**/*.wasm', async (route) => {
      await gate.released
      await route.continue().catch(() => {})
    })
    await openWithText(page, DOCUMENT_20)
    await chooseValidator(page, 'csaf-rs (WASM), in this browser')
    await runButton(page).click()
    await expect(
      page.getByText(/no results of this run are kept/),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Cancel run' }).click()
    gate.release()

    await expect(runState(page, 'Run cancelled')).toContainText(
      /0 of \d+ selected tests returned a result/,
    )
  })
})

test.describe('a validator that cannot run', () => {
  for (const [validator, service] of [
    ['csaf-validator-service (JavaScript service)', 'JavaScript'],
    ['csaf-service (Rust service)', 'Rust'],
  ] as const) {
    test(`${service} without a URL is unavailable and its run button is off`, async ({
      page,
    }) => {
      await openWithText(page, DOCUMENT_20)
      const radio = page.getByRole('radio', { name: validator })
      await radio.check()

      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'This validator is unavailable' }),
      ).toContainText(`Enter a ${service} service URL`)
      await expect(runButton(page)).toBeDisabled()
    })
  }

  test('the JavaScript service discloses that it supports CSAF 2.0 only', async ({
    page,
    mock,
    runtimeConfig,
  }) => {
    const service = await mock(serviceAnswer())
    await runtimeConfig({
      version: 1,
      services: { javascript: service.url },
      defaults: { validator: 'csaf-validator-service', csafVersion: '2.1' },
    })
    await openWithText(page, DOCUMENT_20)

    await expect(
      page.getByRole('heading', { name: 'Limitations' }),
    ).toBeVisible()
    await expect(
      page.getByText(/A CSAF 2\.1 request you select is sent like any other/),
    ).toBeVisible()
  })
})
