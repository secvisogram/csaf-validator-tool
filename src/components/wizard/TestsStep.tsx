import { useTranslation } from 'react-i18next'
import type { SessionEdits, Settings } from '../../config/types.ts'
import type { WorkbenchState } from '../../workbench/useWorkbench.ts'
import { CatalogueView } from '../CatalogueView.tsx'
import { SettingsPanel } from '../SettingsPanel.tsx'

type TestsStepProps = {
  wb: WorkbenchState
  settings: Settings
  onEdit: (edit: SessionEdits) => void
}

export const TestsStep: React.FC<TestsStepProps> = ({
  wb,
  settings,
  onEdit,
}) => {
  const { t } = useTranslation()
  const { resolution, catalogue, selection, adapter } = wb

  return (
    <>
      <SettingsPanel settings={settings} onEdit={onEdit} />

      <section aria-labelledby="catalogue-heading">
        <h2 id="catalogue-heading">{t('catalogue.heading')}</h2>
        {resolution.status === 'resolved' && catalogue && selection && (
          <>
            <p>
              {t('catalogue.version.selected')}:{' '}
              <strong>
                {t(
                  resolution.origin === 'document'
                    ? 'catalogue.version.fromDocument'
                    : 'catalogue.version.explicit',
                  { title: catalogue.title },
                )}
              </strong>
            </p>
            <CatalogueView
              key={catalogue.snapshot}
              catalogue={catalogue}
              adapter={adapter}
              selection={selection}
              onChange={wb.select}
              onReset={wb.resetSelection}
            />
          </>
        )}
        {resolution.status === 'no-document' && (
          <p role="alert">{t('catalogue.problem.noDocument')}</p>
        )}
        {resolution.status === 'missing-version' && (
          <p role="alert">{t('catalogue.problem.missing')}</p>
        )}
        {resolution.status === 'unsupported-version' && (
          <p role="alert">
            {t('catalogue.problem.unsupported', {
              version: resolution.version,
            })}
          </p>
        )}
      </section>
    </>
  )
}
