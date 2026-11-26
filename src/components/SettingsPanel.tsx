import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { adaptersFor } from '../adapters/index.ts'
import type { VersionChoice } from '../catalogue/catalogues.ts'
import {
  CSAF_VERSION_CHOICES,
  VALIDATOR_IDS,
  type SessionEdits,
  type Settings,
  type ValidatorId,
} from '../config/types.ts'
import { ServiceUrlField } from './ServiceUrlField.tsx'

type SettingsPanelProps = {
  settings: Settings
  onEdit: (edit: SessionEdits) => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onEdit,
}) => {
  const { t } = useTranslation()
  const id = useId()
  const adapters = adaptersFor(settings.services)
  const { availability } = adapters[settings.validator]

  return (
    <section aria-labelledby="settings-heading">
      <h2 id="settings-heading">{t('settings.heading')}</h2>
      <p className="muted">{t('settings.note')}</p>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-validator`}>{t('validators.legend')}</label>
          <select
            id={`${id}-validator`}
            value={settings.validator}
            onChange={(event) =>
              onEdit({ validator: event.target.value as ValidatorId })
            }
          >
            {VALIDATOR_IDS.map((validator) => (
              <option key={validator} value={validator}>
                {t(`validators.names.${validator}`)}
                {!adapters[validator].availability.available &&
                  ` (${t('validators.unavailableShort')})`}
              </option>
            ))}
          </select>
          {!availability.available && (
            <p className="maintenance">
              {t('validators.unavailable', {
                reason: t(availability.reasonKey),
              })}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor={`${id}-version`}>
            {t('catalogue.version.legend')}
          </label>
          <select
            id={`${id}-version`}
            value={settings.csafVersion}
            onChange={(event) =>
              onEdit({ csafVersion: event.target.value as VersionChoice })
            }
          >
            {CSAF_VERSION_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {t(`catalogue.version.${choice}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <details>
        <summary>{t('settings.services.legend')}</summary>
        <p className="muted">{t('settings.services.clearHint')}</p>
        <ServiceUrlField
          id="service-javascript"
          label={t('settings.services.javascript')}
          value={settings.services.javascript}
          onChange={(javascript) => onEdit({ services: { javascript } })}
        />
        <ServiceUrlField
          id="service-rust"
          label={t('settings.services.rust')}
          value={settings.services.rust}
          onChange={(rust) => onEdit({ services: { rust } })}
        />
      </details>
    </section>
  )
}
