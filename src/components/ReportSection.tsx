import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CATALOGUES } from '../catalogue/catalogues.ts'
import { REPORT_VIEWS, type ReportView } from '../config/types.ts'
import { buildReport } from '../validation/report.ts'
import { runProgress, type RunState } from '../validation/runState.ts'
import type { ValidatorAdapter } from '../validation/types.ts'
import { AllMessagesTab } from './report/AllMessagesTab.tsx'
import { DetailedTab } from './report/DetailedTab.tsx'
import { SummaryTab } from './report/SummaryTab.tsx'

type ReportSectionProps = {
  run: RunState
  /** The adapter the run was made with, not the one selected now. */
  adapter: ValidatorAdapter
  view: ReportView
  onViewChange: (view: ReportView) => void
}

export const ReportSection: React.FC<ReportSectionProps> = ({
  run,
  adapter,
  view,
  onViewChange,
}) => {
  const { t } = useTranslation()
  const id = useId()
  const catalogue = CATALOGUES[run.request.snapshot]
  const capability = adapter.capability
  const report = useMemo(
    () => buildReport(catalogue, run, capability),
    [catalogue, run, capability],
  )
  const progress = runProgress(run)

  const onKeyDown = (event: React.KeyboardEvent, current: ReportView) => {
    const index = REPORT_VIEWS.indexOf(current)
    const offset =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (offset === 0) return
    event.preventDefault()
    const next =
      REPORT_VIEWS[(index + offset + REPORT_VIEWS.length) % REPORT_VIEWS.length]
    if (next) {
      onViewChange(next)
      document.getElementById(`${id}-tab-${next}`)?.focus()
    }
  }

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
      {run.reportedValid !== undefined && (
        <p>{t('report.reportedValid', { value: String(run.reportedValid) })}</p>
      )}
      <p className="muted">{t('report.noVerdict')}</p>

      <div role="tablist" aria-label={t('report.tabs.label')}>
        {REPORT_VIEWS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${id}-tab-${name}`}
            aria-selected={view === name}
            aria-controls={`${id}-panel`}
            tabIndex={view === name ? 0 : -1}
            onClick={() => onViewChange(name)}
            onKeyDown={(event) => onKeyDown(event, name)}
          >
            {t(`report.tabs.${name}`)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${view}`}
      >
        {view === 'summary' && <SummaryTab report={report} />}
        {view === 'all-messages' && <AllMessagesTab report={report} />}
        {view === 'detailed' && (
          <DetailedTab report={report} capability={capability} />
        )}
      </div>
    </section>
  )
}
