import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeServiceUrl } from '../config/validate.ts'
import type { UrlProblem } from '../config/types.ts'

type ServiceUrlFieldProps = {
  id: string
  label: string
  /** The effective value, used as the starting text. */
  value: string | null
  onChange: (url: string | null) => void
}

export const ServiceUrlField: React.FC<ServiceUrlFieldProps> = ({
  id,
  label,
  value,
  onChange,
}) => {
  const { t } = useTranslation()
  const [text, setText] = useState(value ?? '')
  const [problem, setProblem] = useState<UrlProblem | null>(null)

  const update = (next: string) => {
    setText(next)
    if (next === '') {
      setProblem(null)
      onChange(null)
      return
    }
    const result = normalizeServiceUrl(next)
    if (result.ok) {
      setProblem(null)
      onChange(result.url)
    } else {
      setProblem(result.problem)
    }
  }

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={text}
        placeholder={t('settings.services.placeholder')}
        aria-describedby={problem ? `${id}-problem` : undefined}
        aria-invalid={problem !== null}
        onChange={(event) => update(event.target.value)}
      />
      {problem && (
        <p id={`${id}-problem`} role="alert">
          {t(`settings.urlProblem.${problem}`)}
        </p>
      )}
    </div>
  )
}
