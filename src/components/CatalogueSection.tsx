import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CATALOGUES,
  resolveSnapshot,
  type VersionChoice,
} from '../catalogue/catalogues.ts'
import { initialSelection, type Selection } from '../catalogue/selection.ts'
import type { SnapshotId } from '../catalogue/types.ts'
import type { VersionInfo } from '../intake/types.ts'
import { CatalogueView } from './CatalogueView.tsx'
import { VersionSelector } from './VersionSelector.tsx'

type CatalogueSectionProps = {
  documentVersion: VersionInfo | null
}

export const CatalogueSection: React.FC<CatalogueSectionProps> = ({
  documentVersion,
}) => {
  const { t } = useTranslation()
  const [choice, setChoice] = useState<VersionChoice>('document')
  // Edits are kept per snapshot for the session, so switching versions does not lose them.
  const [edited, setEdited] = useState<Partial<Record<SnapshotId, Selection>>>(
    {},
  )
  const resolution = resolveSnapshot(choice, documentVersion)

  return (
    <section aria-labelledby="catalogue-heading">
      <h2 id="catalogue-heading">{t('catalogue.heading')}</h2>
      <VersionSelector value={choice} onChange={setChoice} />

      {resolution.status === 'resolved' &&
        (() => {
          const catalogue = CATALOGUES[resolution.snapshot]
          const snapshot = catalogue.snapshot
          return (
            <>
              <p>
                {t('catalogue.version.selected')}:{' '}
                <strong>
                  {t(
                    resolution.origin === 'document'
                      ? 'catalogue.version.fromDocument'
                      : 'catalogue.version.explicit',
                    { title: catalogue.title },
                  )}
                </strong>
              </p>
              <CatalogueView
                key={snapshot}
                catalogue={catalogue}
                selection={edited[snapshot] ?? initialSelection(catalogue)}
                onChange={(selection) =>
                  setEdited((previous) => ({
                    ...previous,
                    [snapshot]: selection,
                  }))
                }
                onReset={() =>
                  setEdited((previous) => {
                    const next = { ...previous }
                    delete next[snapshot]
                    return next
                  })
                }
              />
            </>
          )
        })()}
      {resolution.status === 'no-document' && (
        <p role="alert">{t('catalogue.problem.noDocument')}</p>
      )}
      {resolution.status === 'missing-version' && (
        <p role="alert">{t('catalogue.problem.missing')}</p>
      )}
      {resolution.status === 'unsupported-version' && (
        <p role="alert">
          {t('catalogue.problem.unsupported', { version: resolution.version })}
        </p>
      )}
    </section>
  )
}
