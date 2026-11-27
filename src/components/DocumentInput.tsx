import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  loadFromFile,
  loadFromText,
  loadFromUrl,
} from '../intake/loadDocument.ts'
import type { IntakeResult, LoadedDocument } from '../intake/types.ts'

type DocumentInputProps = {
  onResult: (result: IntakeResult<LoadedDocument>) => void
}

const MODES = ['text', 'file', 'url'] as const
type Mode = (typeof MODES)[number]

export const DocumentInput: React.FC<DocumentInputProps> = ({ onResult }) => {
  const { t } = useTranslation()
  const id = useId()
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function fetchUrl() {
    setFetching(true)
    try {
      onResult(await loadFromUrl(url))
    } finally {
      setFetching(false)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent, current: Mode) => {
    const offset =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (offset === 0) return
    event.preventDefault()
    const next =
      MODES[(MODES.indexOf(current) + offset + MODES.length) % MODES.length]
    if (next) {
      setMode(next)
      document.getElementById(`${id}-tab-${next}`)?.focus()
    }
  }

  return (
    <div className="document-input">
      <div
        role="tablist"
        aria-label={t('input.sourceLabel')}
        className="segmented"
      >
        {MODES.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${id}-tab-${name}`}
            aria-selected={mode === name}
            aria-controls={`${id}-panel`}
            tabIndex={mode === name ? 0 : -1}
            onClick={() => setMode(name)}
            onKeyDown={(event) => onKeyDown(event, name)}
          >
            {t(`input.${name}Heading`)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${mode}`}
      >
        {mode === 'text' && (
          <>
            <label htmlFor={`${id}-text`}>{t('input.textLabel')}</label>
            <textarea
              id={`${id}-text`}
              value={text}
              spellCheck={false}
              placeholder='{ "document": { … } }'
              onChange={(event) => setText(event.target.value)}
            />
            <button
              type="button"
              className="button-primary"
              onClick={() => onResult(loadFromText(text, { kind: 'text' }))}
            >
              {t('input.textSubmit')}
            </button>
          </>
        )}

        {mode === 'file' && (
          <>
            <label htmlFor={`${id}-file`}>{t('input.fileLabel')}</label>
            <input
              ref={fileInput}
              id={`${id}-file`}
              type="file"
              accept=".json,application/json"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                onResult(await loadFromFile(file))
                if (fileInput.current) fileInput.current.value = ''
              }}
            />
          </>
        )}

        {mode === 'url' && (
          <>
            <label htmlFor={`${id}-url`}>{t('input.urlLabel')}</label>
            <input
              id={`${id}-url`}
              type="url"
              value={url}
              placeholder="https://example.com/advisory.json"
              onChange={(event) => setUrl(event.target.value)}
            />
            <button
              type="button"
              className="button-primary"
              disabled={fetching}
              onClick={fetchUrl}
            >
              {fetching ? t('input.fetching') : t('input.urlSubmit')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
