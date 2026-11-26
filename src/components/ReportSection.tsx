import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createHintLookup } from '../hints/match.ts'
import type { HintSet } from '../hints/types.ts'
import { CATALOGUES } from '../catalogue/catalogues.ts'
import type { ReportView } from '../config/types.ts'
import type { Report } from '../validation/report.ts'
import { runProgress, type RunState } from '../validation/runState.ts'
import type { ValidatorAdapter } from '../validation/types.ts'
import { AllMessagesTab } from './report/AllMessagesTab.tsx'
import { DetailedTab } from './report/DetailedTab.tsx'
import { SummaryTab } from './report/SummaryTab.tsx'

type ReportSectionProps = {
  run: RunState
  report: Report
  hints?: HintSet
  /** The adapter the run was made with, not the one selected now. */
  adapter: ValidatorAdapter
  view: ReportView
}

export const ReportSection: React.FC<ReportSectionProps> = ({
  run,
  report,
  hints,
  adapter,
  view,
}) => {
  const { t } = useTranslation()
  const catalogue = CATALOGUES[run.request.snapshot]
  // The hints of the validator and version that ran, not of the current selection.
  const hint = useMemo(
    () =>
      hints
        ? createHintLookup(hints, catalogue.csafVersion, run.request.validator)
        : undefined,
    [hints, catalogue, run.request.validator],
  )
  const progress = runProgress(run)
  const resultNotes = adapter.resultNoteKeys ?? []

  return (
    <section aria-labelledby="report-heading">
      <h2 id="report-heading">{t('report.heading')}</h2>
      <p>
        {t('report.context', {
          snapshot: catalogue.title,
          validator: t(`validators.names.${run.request.validator}`),
        })}
      </p>
      <div role="status" className="run-state" data-phase={run.phase}>
        <strong>{t(`report.state.${run.phase}`)}</strong>{' '}
        {t(`report.stateLine.${run.phase}`, {
          ...progress,
          returned: report.counts.returned,
          selected: report.counts.selected,
        })}
        {run.failure !== undefined && (
          <div role="alert">
            {t('report.failure', { message: run.failure })}
          </div>
        )}
      </div>
      {resultNotes.length > 0 && (
        <ul className="notice">
          {resultNotes.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      )}
      {run.reportedValid !== undefined && (
        <p>
          {t('report.reportedValid', { value: String(run.reportedValid) })}
          {resultNotes.length > 0 && <> {t('report.reportedValidFlattened')}</>}
        </p>
      )}
      <p className="muted">{t('report.noVerdict')}</p>

      <div
        role="tabpanel"
        id="report-panel"
        aria-labelledby={`report-tab-${view}`}
      >
        {view === 'summary' && <SummaryTab report={report} />}
        {view === 'all-messages' && (
          <AllMessagesTab report={report} {...(hint && { hint })} />
        )}
        {view === 'detailed' && (
          <DetailedTab report={report} {...(hint && { hint })} />
        )}
      </div>
    </section>
  )
}
