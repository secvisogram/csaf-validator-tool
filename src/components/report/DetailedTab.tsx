import { useTranslation } from 'react-i18next'
import type { Capability } from '../../validation/types.ts'
import { rowMessages, type Report } from '../../validation/report.ts'
import { StatusBadge } from '../StatusBadge.tsx'
import {
  MessageList,
  SectionCell,
  StatusNote,
  useRowTitle,
} from './RowParts.tsx'
import { Uncatalogued } from './Uncatalogued.tsx'

export const DetailedTab: React.FC<{
  report: Report
  capability: (id: string) => Capability
}> = ({ report, capability }) => {
  const { t } = useTranslation()
  const title = useRowTitle()

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('report.table.section')}</th>
            <th scope="col">{t('report.table.test')}</th>
            <th scope="col">{t('report.table.selected')}</th>
            <th scope="col">{t('catalogue.table.support')}</th>
            <th scope="col">{t('report.table.status')}</th>
            <th scope="col">{t('report.table.messages')}</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => {
            const messages = rowMessages(row.status)
            return (
              <tr
                key={row.id}
                data-row-id={row.id}
                data-status={row.status.kind}
              >
                <td>
                  <SectionCell row={row} />
                </td>
                <td>{title(row)}</td>
                <td>
                  {row.selected ? t('report.table.yes') : t('report.table.no')}
                </td>
                <td>{t(`report.capability.${capability(row.id).state}`)}</td>
                <td>
                  <StatusBadge kind={row.status.kind} />
                </td>
                <td>
                  <StatusNote row={row} />
                  {messages.length > 0 && <MessageList messages={messages} />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Uncatalogued results={report.uncatalogued} />
    </div>
  )
}
