import { useTranslation } from 'react-i18next'
import {
  rowMessages,
  type Report,
  type ReportMessage,
  type ReportRow,
} from '../../validation/report.ts'
import type { HintLookup } from '../../hints/match.ts'
import { StatusBadge } from '../StatusBadge.tsx'
import { HintNote } from './HintNote.tsx'
import { Uncatalogued } from './Uncatalogued.tsx'
import { SectionCell, StatusNote, useRowTitle } from './RowParts.tsx'

/**
 * Every message the validator returned, plus a line for each row that has a
 * state to explain instead of a message. Nothing is invented for rows that
 * simply succeeded or were not selected.
 */
export const AllMessagesTab: React.FC<{
  report: Report
  hint?: HintLookup
}> = ({ report, hint }) => {
  const { t } = useTranslation()
  const title = useRowTitle()

  type Entry = {
    key: string
    row: ReportRow
    message: ReportMessage | null
    /** The first entry of a row also carries the general hint of its test. */
    first: boolean
  }
  const entries = report.rows.flatMap((row): Entry[] => {
    const messages = rowMessages(row.status)
    if (messages.length > 0) {
      return messages.map((message, index) => ({
        key: `${row.id}-m${index}`,
        row,
        message,
        first: index === 0,
      }))
    }
    const kind = row.status.kind
    if (
      kind === 'unavailable' ||
      kind === 'missing' ||
      kind === 'execution-error' ||
      kind === 'run-failed' ||
      kind === 'cancelled' ||
      kind === 'skipped' ||
      kind === 'failed'
    ) {
      return [{ key: `${row.id}-s`, row, message: null, first: true }]
    }
    return []
  })

  return (
    <div>
      {entries.length === 0 && report.uncatalogued.length === 0 ? (
        <p>{t('report.table.noMessagesRow')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">{t('report.table.section')}</th>
              <th scope="col">{t('report.table.test')}</th>
              <th scope="col">{t('report.table.status')}</th>
              <th scope="col">{t('report.table.message')}</th>
              <th scope="col">{t('report.table.path')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ key, row, message, first }) => {
              const specific = message && hint?.forMessage(row, message)
              const general = first && hint?.forRow(row)
              return (
                <tr key={key} data-row-id={row.id}>
                  <td>
                    <SectionCell row={row} />
                  </td>
                  <td>{title(row)}</td>
                  <td>
                    {message ? (
                      <span className={`severity severity-${message.severity}`}>
                        {t(`report.severity.${message.severity}`)}
                      </span>
                    ) : (
                      <StatusBadge kind={row.status.kind} />
                    )}
                  </td>
                  <td>
                    {message ? message.message : <StatusNote row={row} />}
                    {specific && <HintNote match={specific} />}
                    {general && <HintNote match={general} />}
                  </td>
                  <td>
                    {message?.instancePath !== undefined && (
                      <code>{message.instancePath}</code>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <Uncatalogued results={report.uncatalogued} />
    </div>
  )
}
