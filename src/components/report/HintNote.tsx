import { useTranslation } from 'react-i18next'
import type { HintMatch } from '../../hints/match.ts'

/**
 * A supplemental hint. It is clearly labelled as guidance and never as a
 * result. The text is shown as plain text: no HTML, Markdown or links.
 */
export const HintNote: React.FC<{ match: HintMatch }> = ({ match }) => {
  const { t } = useTranslation()
  return (
    <div className="hint" data-hint-level={match.level}>
      <strong className="hint-label">{t('hints.label')}</strong>{' '}
      <span className="muted">{t('hints.notResult')}</span>{' '}
      <span className="hint-text">{match.hint.text}</span>
    </div>
  )
}
