import { useTranslation } from 'react-i18next'
import type { RowKind } from '../validation/report.ts'

export const StatusBadge: React.FC<{ kind: RowKind | 'uncatalogued' }> = ({
  kind,
}) => {
  const { t } = useTranslation()
  return (
    <span className={`badge badge-${kind}`}>
      {kind === 'uncatalogued'
        ? t('report.counts.uncatalogued')
        : t(`report.status.${kind}`)}
    </span>
  )
}
