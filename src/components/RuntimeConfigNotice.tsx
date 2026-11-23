import { useTranslation } from 'react-i18next'
import type { RuntimeConfigProblem } from '../config/types.ts'

type RuntimeConfigNoticeProps = {
  problem: RuntimeConfigProblem
}

export const RuntimeConfigNotice: React.FC<RuntimeConfigNoticeProps> = ({
  problem,
}) => {
  const { t } = useTranslation()

  return (
    <section role="status" className="notice">
      <h2>{t('config.notice.heading')}</h2>
      <p>
        {problem.kind === 'http'
          ? t('config.notice.http', { status: problem.status })
          : t(`config.notice.${problem.kind}`)}{' '}
        {t('config.notice.fallback')}
      </p>
      {problem.kind === 'invalid' && (
        <ul>
          {problem.issues.map((issue) => (
            <li key={`${issue.path}:${issue.code}`}>
              {issue.path !== '' && <code>{issue.path}</code>}
              {issue.path !== '' && ': '}
              {issue.code === 'invalidUrl' && issue.problem
                ? t(`config.issue.url.${issue.problem}`)
                : t(`config.issue.${issue.code}`)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
