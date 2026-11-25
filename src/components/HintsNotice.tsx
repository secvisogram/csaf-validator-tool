import { useTranslation } from 'react-i18next'
import type { HintsProblem } from '../hints/types.ts'

const MAX_LISTED = 10

/** A non-blocking warning. Validation and reporting continue without hints. */
export const HintsNotice: React.FC<{ problem: HintsProblem }> = ({
  problem,
}) => {
  const { t } = useTranslation()
  const issues = problem.kind === 'invalid' ? problem.issues : []

  return (
    <section role="status" className="notice">
      <h2>{t('hints.notice.heading')}</h2>
      <p>
        {problem.kind === 'http'
          ? t('hints.notice.http', { status: problem.status })
          : t(`hints.notice.${problem.kind}`)}{' '}
        {t('hints.notice.fallback')}
      </p>
      {issues.length > 0 && (
        <ul>
          {issues.slice(0, MAX_LISTED).map((issue, index) => (
            <li key={index}>
              {issue.path !== '' && <code>{issue.path}</code>}
              {issue.path !== '' && ': '}
              {t(`hints.issue.${issue.code}`)}
              {issue.line !== undefined &&
                ` (${t('hints.notice.line', { line: issue.line })})`}
            </li>
          ))}
          {issues.length > MAX_LISTED && (
            <li>
              {t('hints.notice.more', { count: issues.length - MAX_LISTED })}
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
