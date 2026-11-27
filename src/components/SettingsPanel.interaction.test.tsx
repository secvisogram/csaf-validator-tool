// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../i18n/i18n.ts'
import { BUILT_IN_DEFAULTS } from '../config/settings.ts'
import { SettingsPanel } from './SettingsPanel.tsx'

afterEach(cleanup)

function setup() {
  const onEdit = vi.fn()
  render(<SettingsPanel settings={BUILT_IN_DEFAULTS} onEdit={onEdit} />)
  return onEdit
}

describe('session edits', () => {
  it('edits the validator, including one that is not implemented', () => {
    const onEdit = setup()
    fireEvent.change(screen.getByLabelText('Validator'), {
      target: { value: 'csaf-rs-wasm' },
    })
    expect(onEdit).toHaveBeenCalledWith({ validator: 'csaf-rs-wasm' })
  })

  it('edits the CSAF version', () => {
    const onEdit = setup()
    fireEvent.change(screen.getByLabelText('CSAF version'), {
      target: { value: '2.1' },
    })
    expect(onEdit).toHaveBeenCalledWith({ csafVersion: '2.1' })
  })

  it('applies a valid service URL in normalized form', () => {
    const onEdit = setup()
    fireEvent.change(screen.getByLabelText('JavaScript service URL'), {
      target: { value: 'http://127.0.0.1:8080/' },
    })
    expect(onEdit).toHaveBeenLastCalledWith({
      services: { javascript: 'http://127.0.0.1:8080' },
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not apply an invalid service URL and says why', () => {
    const onEdit = setup()
    fireEvent.change(screen.getByLabelText('Rust service URL'), {
      target: { value: 'http://user:pw@host' },
    })
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('credentials')
  })

  it('clears a service URL when the field is emptied', () => {
    const onEdit = setup()
    const field = screen.getByLabelText('JavaScript service URL')
    fireEvent.change(field, { target: { value: 'http://a.example' } })
    fireEvent.change(field, { target: { value: '' } })
    expect(onEdit).toHaveBeenLastCalledWith({ services: { javascript: null } })
  })
})
