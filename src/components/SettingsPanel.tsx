import { useTranslation } from 'react-i18next'
import { ADAPTERS } from '../adapters/index.ts'
import {
  REPORT_VIEWS,
  VALIDATOR_IDS,
  type SessionEdits,
  type Settings,
} from '../config/types.ts'
import { ServiceUrlField } from './ServiceUrlField.tsx'
import { VersionSelector } from './VersionSelector.tsx'

type SettingsPanelProps = {
  settings: Settings
  onEdit: (edit: SessionEdits) => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onEdit,
}) => {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="settings-heading">
      <h2 id="settings-heading">{t('settings.heading')}</h2>
      <p>{t('settings.note')}</p>

      <fieldset>
        <legend>{t('validators.legend')}</legend>
        {VALIDATOR_IDS.map((id) => {
          const availability = ADAPTERS[id].availability
          return (
            <label key={id} className="inline-label">
              <input
                type="radio"
                name="validator"
                checked={settings.validator === id}
                onChange={() => onEdit({ validator: id })}
              />{' '}
              {t(`validators.names.${id}`)}
              {!availability.available && (
                <span className="maintenance">
                  {' '}
                  {t('validators.unavailable', {
                    reason: t(availability.reasonKey),
                  })}
                </span>
              )}
            </label>
          )
        })}
      </fieldset>

      <VersionSelector
        value={settings.csafVersion}
        onChange={(csafVersion) => onEdit({ csafVersion })}
      />

      <fieldset>
        <legend>{t('report.tabs.label')}</legend>
        {REPORT_VIEWS.map((view) => (
          <label key={view} className="inline-label">
            <input
              type="radio"
              name="report-view"
              checked={settings.reportView === view}
              onChange={() => onEdit({ reportView: view })}
            />{' '}
            {t(`report.tabs.${view}`)}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>{t('settings.services.legend')}</legend>
        <p>{t('settings.services.clearHint')}</p>
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
      </fieldset>
    </section>
  )
}
