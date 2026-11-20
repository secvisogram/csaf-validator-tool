import { useTranslation } from 'react-i18next'
import type { VersionChoice } from '../catalogue/catalogues.ts'

const CHOICES: VersionChoice[] = ['document', '2.0', '2.1']

type VersionSelectorProps = {
  value: VersionChoice
  onChange: (choice: VersionChoice) => void
}

export const VersionSelector: React.FC<VersionSelectorProps> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation()

  return (
    <fieldset>
      <legend>{t('catalogue.version.legend')}</legend>
      {CHOICES.map((choice) => (
        <label key={choice} className="inline-label">
          <input
            type="radio"
            name="csaf-version"
            checked={value === choice}
            onChange={() => onChange(choice)}
          />{' '}
          {t(`catalogue.version.${choice}`)}
        </label>
      ))}
    </fieldset>
  )
}
