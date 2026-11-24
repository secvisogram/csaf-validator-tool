import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ADAPTERS } from '../adapters/index.ts'
import { CATALOGUES, resolveSnapshot } from '../catalogue/catalogues.ts'
import { initialSelection, type Selection } from '../catalogue/selection.ts'
import type { SnapshotId } from '../catalogue/types.ts'
import type { SessionEdits, Settings } from '../config/types.ts'
import type { HintSet } from '../hints/types.ts'
import type { LoadedDocument } from '../intake/types.ts'
import { useRun } from '../validation/useRun.ts'
import { CatalogueView } from './CatalogueView.tsx'
import { ReportSection } from './ReportSection.tsx'
import { RunPanel } from './RunPanel.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'

type WorkbenchProps = {
  loaded: LoadedDocument | null
  settings: Settings
  onEdit: (edit: SessionEdits) => void
  /** The valid supplemental hints. Without them, reports are shown without hints. */
  hints?: HintSet
}

export const Workbench: React.FC<WorkbenchProps> = ({
  loaded,
  settings,
  onEdit,
  hints,
}) => {
  const { t } = useTranslation()
  // Edits are kept per snapshot for the session, so switching versions does not lose them.
  const [edited, setEdited] = useState<Partial<Record<SnapshotId, Selection>>>(
    {},
  )
  const { run, start, cancel, clear } = useRun()
  const adapter = ADAPTERS[settings.validator]
  const resolution = resolveSnapshot(
    settings.csafVersion,
    loaded?.version ?? null,
  )

  // A report belongs to the document it was run on.
  useEffect(() => clear, [loaded, clear])

  const catalogue =
    resolution.status === 'resolved' ? CATALOGUES[resolution.snapshot] : null
  const selection = useMemo(
    () =>
      catalogue
        ? (edited[catalogue.snapshot] ?? initialSelection(catalogue))
        : null,
    [catalogue, edited],
  )

  return (
    <>
      <SettingsPanel settings={settings} onEdit={onEdit} />

      <section aria-labelledby="catalogue-heading">
        <h2 id="catalogue-heading">{t('catalogue.heading')}</h2>
        {resolution.status === 'resolved' && catalogue && selection && (
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
              key={catalogue.snapshot}
              catalogue={catalogue}
              adapter={adapter}
              selection={selection}
              onChange={(next) =>
                setEdited((previous) => ({
                  ...previous,
                  [catalogue.snapshot]: next,
                }))
              }
              onReset={() =>
                setEdited((previous) => {
                  const next = { ...previous }
                  delete next[catalogue.snapshot]
                  return next
                })
              }
            />
          </>
        )}
        {resolution.status === 'no-document' && (
          <p role="alert">{t('catalogue.problem.noDocument')}</p>
        )}
        {resolution.status === 'missing-version' && (
          <p role="alert">{t('catalogue.problem.missing')}</p>
        )}
        {resolution.status === 'unsupported-version' && (
          <p role="alert">
            {t('catalogue.problem.unsupported', {
              version: resolution.version,
            })}
          </p>
        )}
      </section>

      {catalogue && selection && (
        <RunPanel
          catalogue={catalogue}
          selection={selection}
          adapter={adapter}
          document={loaded?.document ?? null}
          run={run}
          onStart={(request) => start(adapter, request)}
          onCancel={cancel}
        />
      )}

      {run && (
        <ReportSection
          run={run}
          {...(hints && { hints })}
          view={settings.reportView}
          onViewChange={(reportView) => onEdit({ reportView })}
        />
      )}
    </>
  )
}
