import { useTranslation } from 'react-i18next'
import type { IntakeResult, LoadedDocument } from '../intake/types.ts'
import { DocumentInput } from './DocumentInput.tsx'
import { DocumentView } from './DocumentView.tsx'
import { IntakeErrorMessage } from './IntakeErrorMessage.tsx'

type DocumentStepProps = {
  result: IntakeResult<LoadedDocument> | null
  onResult: (result: IntakeResult<LoadedDocument>) => void
}

export const DocumentStep: React.FC<DocumentStepProps> = ({
  result,
  onResult,
}) => {
  const { t } = useTranslation()
  return (
    <>
      <section aria-labelledby="input-heading">
        <h2 id="input-heading">{t('input.heading')}</h2>
        <p className="muted">{t('app.intro')}</p>
        <DocumentInput onResult={onResult} />
        {result && !result.ok && <IntakeErrorMessage error={result.error} />}
      </section>
      {result?.ok && <DocumentView loaded={result.value} />}
    </>
  )
}
