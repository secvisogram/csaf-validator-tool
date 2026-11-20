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

export const DocumentInput: React.FC<DocumentInputProps> = ({ onResult }) => {
  const { t } = useTranslation()
  const id = useId()
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

  return (
    <div>
      <section>
        <h2>{t('input.textHeading')}</h2>
        <label htmlFor={`${id}-text`}>{t('input.textLabel')}</label>
        <textarea
          id={`${id}-text`}
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="button"
          onClick={() => onResult(loadFromText(text, { kind: 'text' }))}
        >
          {t('input.textSubmit')}
        </button>
      </section>

      <section>
        <h2>{t('input.fileHeading')}</h2>
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
      </section>

      <section>
        <h2>{t('input.urlHeading')}</h2>
        <label htmlFor={`${id}-url`}>{t('input.urlLabel')}</label>
        <input
          id={`${id}-url`}
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button type="button" disabled={fetching} onClick={fetchUrl}>
          {fetching ? t('input.fetching') : t('input.urlSubmit')}
        </button>
      </section>
    </div>
  )
}
