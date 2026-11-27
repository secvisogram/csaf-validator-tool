import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import type { SessionEdits, Settings } from '../../config/types.ts'
import type { HintSet } from '../../hints/types.ts'
import type { IntakeResult, LoadedDocument } from '../../intake/types.ts'
import { buildReport } from '../../validation/report.ts'
import { useWorkbench } from '../../workbench/useWorkbench.ts'
import { DocumentStep } from '../DocumentStep.tsx'
import { RunStep } from './RunStep.tsx'
import { StepRail } from './StepRail.tsx'
import { STEPS, type Step } from './steps.ts'
import { TestsStep } from './TestsStep.tsx'
import { Toolbar } from './Toolbar.tsx'

type WizardProps = {
  result: IntakeResult<LoadedDocument> | null
  onResult: (result: IntakeResult<LoadedDocument>) => void
  settings: Settings
  onEdit: (edit: SessionEdits) => void
  /** The valid supplemental hints. Without them, reports are shown without hints. */
  hints?: HintSet
  /** Warnings about the runtime configuration or the hint file, shown above every step. */
  notices?: React.ReactNode
}

export const Wizard: React.FC<WizardProps> = ({
  result,
  onResult,
  settings,
  onEdit,
  hints,
  notices,
}) => {
  const { t } = useTranslation()
  const loaded = result?.ok ? result.value : null
  const [step, setStep] = useState<Step>(loaded ? 'tests' : 'document')
  const wb = useWorkbench(loaded, settings)

  const report = useMemo(
    () =>
      wb.run ? buildReport(CATALOGUES[wb.run.request.snapshot], wb.run) : null,
    [wb.run],
  )

  // A document without a usable CSAF version has no catalogue, so there is nothing to run.
  const reached: Step = !loaded ? 'document' : wb.catalogue ? 'run' : 'tests'
  const index = STEPS.indexOf(step)
  const previous = STEPS[index - 1]
  const next = index < STEPS.indexOf(reached) ? STEPS[index + 1] : undefined

  const onDocument = (next: IntakeResult<LoadedDocument>) => {
    onResult(next)
    if (next.ok) setStep('tests')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="menu">
          <h1>{t('app.title')}</h1>
        </div>
        <Toolbar
          report={report}
          view={settings.reportView}
          onViewChange={(reportView) => onEdit({ reportView })}
        />
      </header>

      <StepRail
        step={step}
        onStep={setStep}
        reached={reached}
        loaded={loaded}
        wb={wb}
        settings={settings}
      />

      <main className="app-main">
        <div className="app-content">
          {notices}
          {step === 'document' && (
            <DocumentStep result={result} onResult={onDocument} />
          )}
          {step === 'tests' && (
            <TestsStep wb={wb} settings={settings} onEdit={onEdit} />
          )}
          {step === 'run' && (
            <RunStep
              wb={wb}
              loaded={loaded}
              report={report}
              view={settings.reportView}
              {...(hints && { hints })}
            />
          )}
        </div>
        <footer className="app-footer">
          <button
            type="button"
            disabled={!previous}
            onClick={() => previous && setStep(previous)}
          >
            {t('wizard.back')}
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!next}
            hidden={step === 'run'}
            onClick={() => next && setStep(next)}
          >
            {t('wizard.continue')}
          </button>
        </footer>
      </main>
    </div>
  )
}
