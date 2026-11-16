import { useTranslation } from 'react-i18next'
import type { LoadedDocument } from '../intake/types.ts'

export const DocumentView: React.FC<{ loaded: LoadedDocument }> = ({
  loaded,
}) => {
  const { t } = useTranslation()
  const { source, version } = loaded

  return (
    <section aria-labelledby="document-heading">
      <h2 id="document-heading">{t('document.heading')}</h2>
      <p>
        {source.kind === 'text' && t('document.source.text')}
        {source.kind === 'file' &&
          t('document.source.file', { name: source.name })}
        {source.kind === 'url' && t('document.source.url', { url: source.url })}
      </p>
      {version.status === 'supported' && (
        <p>
          {t('document.version.label')}: <strong>{version.version}</strong>
        </p>
      )}
      {version.status === 'unsupported' && (
        <p role="alert">
          {t('document.version.unsupported', { version: version.version })}
        </p>
      )}
      {version.status === 'missing' && (
        <p role="alert">{t('document.version.missing')}</p>
      )}
      <h3>{t('document.contents')}</h3>
      <pre>{JSON.stringify(loaded.document, null, 2)}</pre>
    </section>
  )
}
