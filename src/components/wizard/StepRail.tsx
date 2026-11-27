import { useTranslation } from 'react-i18next'
import type { LoadedDocument } from '../../intake/types.ts'
import type { WorkbenchState } from '../../workbench/useWorkbench.ts'
import type { Settings } from '../../config/types.ts'
import { STEPS, type Step } from './steps.ts'

type StepRailProps = {
  step: Step
  onStep: (step: Step) => void
  reached: Step
  loaded: LoadedDocument | null
  wb: WorkbenchState
  settings: Settings
}

export const StepRail: React.FC<StepRailProps> = ({
  step,
  onStep,
  reached,
  loaded,
  wb,
  settings,
}) => {
  const { t } = useTranslation()

  const summary = (name: Step): string => {
    if (name === 'document') {
      if (!loaded) return t('wizard.steps.document.prompt')
      const { source, version } = loaded
      const label = t(`wizard.steps.document.source.${source.kind}`, {
        name: source.kind === 'file' ? source.name : '',
        url: source.kind === 'url' ? source.url : '',
      })
      return version.status === 'supported'
        ? t('wizard.steps.document.summaryVersion', {
            source: label,
            version: version.version,
          })
        : t('wizard.steps.document.summary', { source: label })
    }
    if (name === 'tests') {
      if (!loaded || !wb.catalogue || !wb.selection)
        return t('wizard.steps.tests.prompt')
      return t('wizard.steps.tests.summary', {
        validator: t(`validators.names.${settings.validator}`),
        selected: wb.selection.tests.size + (wb.selection.schema ? 1 : 0),
        total: wb.catalogue.tests.length + 1,
      })
    }
    return wb.run
      ? t(`wizard.steps.run.phase.${wb.run.phase}`)
      : t('wizard.steps.run.prompt')
  }

  const current = STEPS.indexOf(step)
  const limit = STEPS.indexOf(reached)

  return (
    <nav className="rail" aria-label={t('wizard.label')}>
      <ol className="steps">
        {STEPS.map((name, index) => (
          <li key={name}>
            <button
              type="button"
              disabled={index > limit}
              aria-current={step === name ? 'step' : undefined}
              onClick={() => onStep(name)}
            >
              <span className="step-number" aria-hidden="true">
                {index < current && index <= limit ? '✓' : index + 1}
              </span>
              <span className="step-text">
                <strong>{t(`wizard.steps.${name}.title`)}</strong>
                <small>{summary(name)}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
