import { useTranslation } from 'react-i18next'
import type { Report } from '../../validation/report.ts'
import { StatusBadge } from '../StatusBadge.tsx'
import { SectionCell, StatusNote, useRowTitle } from './RowParts.tsx'
import { MessageList } from './RowParts.tsx'
import { rowMessages } from '../../validation/report.ts'

const COUNT_KEYS = [
  'succeeded',
  'failed',
  'skipped',
  'unavailable',
  'pending',
  'missing',
  'executionError',
  'runFailed',
  'cancelled',
  'notSelected',
  'uncatalogued',
] as const

export const SummaryTab: React.FC<{ report: Report }> = ({ report }) => {
  const { t } = useTranslation()
  const title = useRowTitle()
  const { counts, messageCounts, attention } = report
  const total = attention.length + report.uncatalogued.length

  return (
    <div>
      <h3>{t('report.counts.heading')}</h3>
      <dl className="counts">
        {COUNT_KEYS.map((key) => (
          <div key={key} className="count" data-count={key}>
            <dt>{t(`report.counts.${key}`)}</dt>
            <dd>{counts[key]}</dd>
          </div>
        ))}
      </dl>
      <p>{t('report.messageCounts', messageCounts)}</p>

      <h3>
        {t('report.attention.heading')}{' '}
        <span className="muted">
          ({t('report.attention.count', { count: total })})
        </span>
      </h3>
      {total === 0 ? (
        <p>{t('report.attention.none')}</p>
      ) : (
        <ul className="attention">
          {attention.map((row) => (
            <li key={row.id} data-row-id={row.id}>
              <strong>
                <SectionCell row={row} />
              </strong>{' '}
              {title(row)} <StatusBadge kind={row.status.kind} />
              <div>
                <StatusNote row={row} />
              </div>
              {rowMessages(row.status).length > 0 && (
                <MessageList messages={rowMessages(row.status)} />
              )}
            </li>
          ))}
          {report.uncatalogued.map((result, index) => (
            <li key={`u${index}`} data-uncatalogued>
              <strong>{result.originalId}</strong>{' '}
              <StatusBadge kind="uncatalogued" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
