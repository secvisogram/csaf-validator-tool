import { useTranslation } from 'react-i18next'
import type { UncataloguedResult } from '../../validation/types.ts'

function show(details: unknown): string {
  try {
    return JSON.stringify(details, null, 2) ?? String(details)
  } catch {
    return String(details)
  }
}

export const Uncatalogued: React.FC<{
  results: readonly UncataloguedResult[]
}> = ({ results }) => {
  const { t } = useTranslation()
  if (results.length === 0) return null
  return (
    <section aria-labelledby="uncatalogued-heading">
      <h3 id="uncatalogued-heading">{t('report.uncatalogued.heading')}</h3>
      <p>{t('report.uncatalogued.note')}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('report.uncatalogued.id')}</th>
            <th scope="col">{t('report.uncatalogued.details')}</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result, index) => (
            <tr key={index}>
              <td>{result.originalId}</td>
              <td>
                <pre>{show(result.details)}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
