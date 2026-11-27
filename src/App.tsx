import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HintsNotice } from './components/HintsNotice.tsx'
import { RuntimeConfigNotice } from './components/RuntimeConfigNotice.tsx'
import { Wizard } from './components/wizard/Wizard.tsx'
import { useSettings } from './config/useSettings.ts'
import { useHints } from './hints/useHints.ts'
import type { IntakeResult, LoadedDocument } from './intake/types.ts'

export const App: React.FC = () => {
  const { t } = useTranslation()
  const [result, setResult] = useState<IntakeResult<LoadedDocument> | null>(
    null,
  )

  const { runtime, settings, edit } = useSettings()
  const hints = useHints()

  if (runtime === null) {
    return (
      <main className="app-loading">
        <h1>{t('app.title')}</h1>
        <p role="status">{t('app.loading')}</p>
      </main>
    )
  }

  return (
    <Wizard
      result={result}
      onResult={setResult}
      settings={settings}
      onEdit={edit}
      {...(hints?.status === 'loaded' && { hints: hints.hints })}
      notices={
        <>
          {runtime.status === 'failed' && (
            <RuntimeConfigNotice problem={runtime.problem} />
          )}
          {hints?.status === 'failed' && (
            <HintsNotice problem={hints.problem} />
          )}
        </>
      }
    />
  )
}
