import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import '../i18n/i18n.ts'
import { BUILT_IN_DEFAULTS } from '../config/settings.ts'
import type { Settings } from '../config/types.ts'
import { SettingsPanel } from './SettingsPanel.tsx'

const render = (settings: Settings = BUILT_IN_DEFAULTS) =>
  renderToStaticMarkup(
    createElement(SettingsPanel, { settings, onEdit: () => {} }),
  )

describe('SettingsPanel', () => {
  const markup = render()

  it('offers all four validators', () => {
    for (const name of [
      'csaf-validator-lib, in this browser',
      'csaf-rs (WASM), in this browser',
      'csaf-validator-service (JavaScript service)',
      'csaf-service (Rust service)',
    ]) {
      expect(markup).toContain(name)
    }
  })

  it('shows no validator as not implemented', () => {
    expect(markup).not.toContain('not implemented')
  })

  it('shows the Rust service as unavailable until its URL is entered, then as available', () => {
    const reason = /Unavailable: Enter a Rust service URL/
    expect(markup).toMatch(reason)
    const configured = render({
      ...BUILT_IN_DEFAULTS,
      services: { javascript: null, rust: 'http://127.0.0.1:8082' },
    })
    expect(configured).not.toMatch(reason)
  })

  it('shows the JavaScript service as unavailable until a URL is entered, then as available', () => {
    const reason = /Unavailable: Enter a JavaScript service URL/
    expect(markup).toMatch(reason)
    const configured = render({
      ...BUILT_IN_DEFAULTS,
      services: { javascript: 'http://127.0.0.1:8080', rust: null },
    })
    expect(configured).not.toMatch(reason)
  })

  it('does not mark the implemented validators as unavailable', () => {
    const entryOf = (label: string) =>
      markup.split(label)[1]?.split('</label>')[0] ?? ''
    expect(entryOf('csaf-validator-lib')).not.toContain('Unavailable')
    expect(entryOf('csaf-rs (WASM), in this browser')).not.toContain(
      'Unavailable',
    )
  })

  it('offers the CSAF version choice, the report views and both service URLs', () => {
    expect(markup).toContain('Use the version declared in the document')
    expect(markup).toContain('CSAF 2.0 (OASIS Standard)')
    expect(markup).toContain('CSAF 2.1 (experimental CSD04)')
    expect(markup).toContain('Summary')
    expect(markup).toContain('All messages')
    expect(markup).toContain('Detailed report')
    expect(markup).toContain('JavaScript service URL')
    expect(markup).toContain('Rust service URL')
  })

  it('shows the effective settings as the starting values', () => {
    const configured: Settings = {
      services: { javascript: 'http://127.0.0.1:8080', rust: null },
      validator: 'csaf-service',
      csafVersion: '2.1',
      reportView: 'detailed',
    }
    const html = render(configured)
    expect(html).toContain('value="http://127.0.0.1:8080"')
    expect(html).toMatch(/name="validator"[^>]*checked=""[^>]*/)
    const checked = html.match(/<input[^>]*checked=""[^>]*>/g) ?? []
    expect(checked).toHaveLength(3)
  })

  it('says that changes last for this session only', () => {
    expect(markup).toContain('never saved')
  })
})
