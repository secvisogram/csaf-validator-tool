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

  it('marks the validators that cannot be used until their URL is entered', () => {
    const option = (html: string, label: string) =>
      html.split(label)[1]?.split('</option>')[0] ?? ''
    expect(option(markup, 'csaf-service (Rust service)')).toContain(
      '(unavailable)',
    )
    expect(
      option(markup, 'csaf-validator-service (JavaScript service)'),
    ).toContain('(unavailable)')
    const configured = render({
      ...BUILT_IN_DEFAULTS,
      services: { javascript: 'http://127.0.0.1:8080', rust: 'http://r.test' },
    })
    expect(option(configured, 'csaf-service (Rust service)')).not.toContain(
      '(unavailable)',
    )
    expect(
      option(configured, 'csaf-validator-service (JavaScript service)'),
    ).not.toContain('(unavailable)')
  })

  it('gives the reason when the selected validator is unavailable, and not otherwise', () => {
    const rust = render({ ...BUILT_IN_DEFAULTS, validator: 'csaf-service' })
    expect(rust).toMatch(/Unavailable: Enter a Rust service URL/)
    const javascript = render({
      ...BUILT_IN_DEFAULTS,
      validator: 'csaf-validator-service',
    })
    expect(javascript).toMatch(/Unavailable: Enter a JavaScript service URL/)
    expect(markup).not.toMatch(/Unavailable:/)
    const configured = render({
      ...BUILT_IN_DEFAULTS,
      validator: 'csaf-service',
      services: { javascript: null, rust: 'http://127.0.0.1:8082' },
    })
    expect(configured).not.toMatch(/Unavailable:/)
  })

  it('does not mark the implemented validators as unavailable', () => {
    const entryOf = (label: string) =>
      markup.split(label)[1]?.split('</option>')[0] ?? ''
    expect(entryOf('csaf-validator-lib')).not.toContain('unavailable')
    expect(entryOf('csaf-rs (WASM), in this browser')).not.toContain(
      'unavailable',
    )
  })

  it('offers the CSAF version choice and both service URLs', () => {
    expect(markup).toContain('Use the version declared in the document')
    expect(markup).toContain('CSAF 2.0 (OASIS Standard)')
    expect(markup).toContain('CSAF 2.1 (experimental CSD04)')
    expect(markup).toContain('JavaScript service URL')
    expect(markup).toContain('Rust service URL')
  })

  it('leaves the report views to the toolbar', () => {
    expect(markup).not.toContain('Detailed report')
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
    const selected = html.match(/<option[^>]*selected=""[^>]*>[^<]*/g) ?? []
    expect(selected).toHaveLength(2)
    expect(selected.join()).toContain('csaf-service (Rust service)')
    expect(selected.join()).toContain('CSAF 2.1 (experimental CSD04)')
  })

  it('says that changes last for this session only', () => {
    expect(markup).toContain('never saved')
  })
})
