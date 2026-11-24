import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DocumentInput } from './components/DocumentInput.tsx'
import { DocumentView } from './components/DocumentView.tsx'
import { IntakeErrorMessage } from './components/IntakeErrorMessage.tsx'
import { Workbench } from './components/Workbench.tsx'
import { RuntimeConfigNotice } from './components/RuntimeConfigNotice.tsx'
import { useSettings } from './config/useSettings.ts'
import type { IntakeResult, LoadedDocument } from './intake/types.ts'

export const App: React.FC = () => {
  const { t } = useTranslation()
  const [result, setResult] = useState<IntakeResult<LoadedDocument> | null>(
    null,
  )

  const { runtime, settings, edit } = useSettings()

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <p>{t('app.intro')}</p>
      {runtime?.status === 'failed' && (
        <RuntimeConfigNotice problem={runtime.problem} />
      )}
      <DocumentInput onResult={setResult} />
      {result && !result.ok && <IntakeErrorMessage error={result.error} />}
      {result?.ok && <DocumentView loaded={result.value} />}
      {runtime !== null && (
        <Workbench
          loaded={result?.ok ? result.value : null}
          settings={settings}
          onEdit={edit}
        />
      )}
    </main>
  )
}
