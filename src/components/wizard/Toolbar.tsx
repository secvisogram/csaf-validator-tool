import { useTranslation } from 'react-i18next'
import { REPORT_VIEWS, type ReportView } from '../../config/types.ts'
import type { Report } from '../../validation/report.ts'

type ToolbarProps = {
  report: Report | null
  view: ReportView
  onViewChange: (view: ReportView) => void
}

/** The second header row: the report views on the left, the returned messages of the run on the right. */
export const Toolbar: React.FC<ToolbarProps> = ({
  report,
  view,
  onViewChange,
}) => {
  const { t } = useTranslation()

  const onKeyDown = (event: React.KeyboardEvent, current: ReportView) => {
    const offset =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (offset === 0) return
    event.preventDefault()
    const next =
      REPORT_VIEWS[
        (REPORT_VIEWS.indexOf(current) + offset + REPORT_VIEWS.length) %
          REPORT_VIEWS.length
      ]
    if (next) {
      onViewChange(next)
      document.getElementById(`report-tab-${next}`)?.focus()
    }
  }

  return (
    <div className="toolbar">
      <div className="toolbar-side" />
      {report && (
        <div
          role="tablist"
          aria-label={t('report.tabs.label')}
          className="toolbar-views"
        >
          <span aria-hidden="true">{t('toolbar.reportView')}:</span>
          {REPORT_VIEWS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`report-tab-${name}`}
              aria-selected={view === name}
              aria-controls="report-panel"
              tabIndex={view === name ? 0 : -1}
              onClick={() => onViewChange(name)}
              onKeyDown={(event) => onKeyDown(event, name)}
            >
              {t(`report.tabs.${name}`)}
            </button>
          ))}
        </div>
      )}
      <div className="toolbar-side toolbar-end">
        {report ? (
          <>
            <span>{t('toolbar.reportMessages')}:</span>
            <span className="led led-error" aria-hidden="true" />
            {t('toolbar.errors', { count: report.messageCounts.errors })}
            <span className="led led-warning" aria-hidden="true" />
            {t('toolbar.warnings', { count: report.messageCounts.warnings })}
            <span className="led led-info" aria-hidden="true" />
            {t('toolbar.infos', { count: report.messageCounts.infos })}
          </>
        ) : (
          t('toolbar.noRun')
        )}
      </div>
    </div>
  )
}
