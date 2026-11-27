// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './i18n/i18n.ts'
import { App } from './App.tsx'

const fetchMock = vi.fn()

function serve(hints: () => Response | Promise<Response>) {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      String(url).endsWith('hints.yaml')
        ? hints()
        : new Response('', { status: 404 }),
    ),
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const notice = () =>
  screen.queryByRole('heading', { name: 'Supplemental hints were not applied' })

describe('the app shell', () => {
  it('shows a loading message until the runtime configuration has been read', async () => {
    serve(() => new Response('hints: []'))
    render(<App />)
    expect(screen.getByText('Loading the configuration…')).toBeTruthy()
    await screen.findByRole('heading', { name: 'Provide a document' })
    expect(screen.queryByText('Loading the configuration…')).toBeNull()
  })
})

describe('the hint file in the app', () => {
  it('requests the hint file next to the app', async () => {
    serve(() => new Response('hints: []'))
    render(<App />)
    await screen.findByRole('heading', { name: 'Provide a document' })
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls).toContain(new URL('hints.yaml', document.baseURI).href)
  })

  it('shows no warning for a valid file', async () => {
    serve(() => new Response('hints: []'))
    render(<App />)
    await screen.findByRole('heading', { name: 'Provide a document' })
    expect(notice()).toBeNull()
  })

  it('warns, without blocking the app, when the file is invalid', async () => {
    serve(
      () =>
        new Response(
          "hints:\n  - csafVersion: '2.0'\n    section: '9.9.9'\n    text: x\n",
        ),
    )
    render(<App />)
    expect(
      await screen.findByText('Supplemental hints were not applied'),
    ).toBeTruthy()
    const warning = screen
      .getByText('Supplemental hints were not applied')
      .closest('section')
    expect(warning?.textContent).toContain('rejected as a whole')
    expect(warning?.textContent).toContain('hints[0].section')
    expect(warning?.textContent).toContain('are shown without hints')
    expect(warning?.getAttribute('role')).toBe('status')
    expect(screen.getByRole('button', { name: 'Use text' })).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Provide a document' }),
    ).toBeTruthy()
  })

  it('warns about a file that is missing, as the app ships it', async () => {
    serve(() => new Response('', { status: 404 }))
    render(<App />)
    const warning = (
      await screen.findByText('Supplemental hints were not applied')
    ).closest('section')
    expect(warning?.textContent).toContain('HTTP 404')
    expect(
      screen.getByRole('heading', { name: 'Provide a document' }),
    ).toBeTruthy()
  })

  it('shows the warning for the hint file next to one for the runtime configuration', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).endsWith('hints.yaml')
          ? new Response('nope: [', { status: 200 })
          : new Response('{', { status: 200 }),
      ),
    )
    render(<App />)
    expect(
      await screen.findByText('Supplemental hints were not applied'),
    ).toBeTruthy()
    expect(
      screen.getByText('Runtime configuration was not applied'),
    ).toBeTruthy()
  })
})
