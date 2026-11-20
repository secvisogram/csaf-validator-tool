import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DocumentInput } from './components/DocumentInput.tsx'
import { DocumentView } from './components/DocumentView.tsx'
import { IntakeErrorMessage } from './components/IntakeErrorMessage.tsx'
import type { IntakeResult, LoadedDocument } from './intake/types.ts'

export const App: React.FC = () => {
  const { t } = useTranslation()
  const [result, setResult] = useState<IntakeResult<LoadedDocument> | null>(
    null,
  )

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <p>{t('app.intro')}</p>
      <DocumentInput onResult={setResult} />
      {result && !result.ok && <IntakeErrorMessage error={result.error} />}
      {result?.ok && <DocumentView loaded={result.value} />}
    </main>
  )
}
