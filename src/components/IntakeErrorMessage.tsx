import { useTranslation } from 'react-i18next'
import type { IntakeError } from '../intake/types.ts'

export const IntakeErrorMessage: React.FC<{ error: IntakeError }> = ({
  error,
}) => {
  const { t } = useTranslation()
  const params = { ...error.params }
  if (error.key === 'notAnObject') {
    params['actual'] = t(`errors.jsonKinds.${String(error.params?.['kind'])}`)
  }
  return (
    <div role="alert">
      <strong>{t('errors.heading')}</strong>
      <p>{t(`errors.${error.key}`, params)}</p>
      {error.fetchHint && <p>{t('errors.fetchHint')}</p>}
    </div>
  )
}
