import { useTranslation } from 'react-i18next'
import {
  rowMessages,
  type ReportMessage,
  type ReportRow,
} from '../../validation/report.ts'
import type { HintMatch } from '../../hints/match.ts'
import { SafeLink } from '../SafeLink.tsx'
import { HintNote } from './HintNote.tsx'

export function useRowTitle() {
  const { t } = useTranslation()
  return (row: ReportRow) =>
    row.section === null ? t('report.table.schemaCheck') : row.title
}

export const SectionCell: React.FC<{ row: ReportRow }> = ({ row }) => {
  const { t } = useTranslation()
  const label = row.section ?? t('report.table.schemaCheck')
  if (!row.specificationUrl) return <>{label}</>
  return (
    <SafeLink
      href={row.specificationUrl}
      aria-label={t('report.link.openLabel', { section: label })}
    >
      {label}
    </SafeLink>
  )
}

export const MessageList: React.FC<{
  messages: ReportMessage[]
  /** The hint that matches a message by its exact text. */
  hintFor?: (message: ReportMessage) => HintMatch | null
}> = ({ messages, hintFor }) => {
  const { t } = useTranslation()
  return (
    <ul className="messages">
      {messages.map((message, index) => {
        const match = hintFor?.(message)
        return (
          <li key={index} data-severity={message.severity}>
            <span className={`severity severity-${message.severity}`}>
              {t(`report.severity.${message.severity}`)}
            </span>{' '}
            {message.message}
            {message.instancePath !== undefined && (
              <>
                {' '}
                <code>{message.instancePath}</code>
              </>
            )}
            {match && <HintNote match={match} />}
          </li>
        )
      })}
    </ul>
  )
}

/** The explanation of a row's state: the reason it is unavailable, an error text, or the generic note. */
export const StatusNote: React.FC<{ row: ReportRow }> = ({ row }) => {
  const { t } = useTranslation()
  const { status } = row
  return (
    <>
      {t(`report.note.${status.kind}`)}
      {status.kind === 'unavailable' && status.reason !== '' && (
        <> {status.reason}</>
      )}
      {(status.kind === 'execution-error' || status.kind === 'run-failed') &&
        status.message !== '' && <> {status.message}</>}
    </>
  )
}

export function hasMessages(row: ReportRow): boolean {
  return rowMessages(row.status).length > 0
}
