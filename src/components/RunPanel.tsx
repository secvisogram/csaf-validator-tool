import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Selection } from '../catalogue/selection.ts'
import type { Catalogue } from '../catalogue/types.ts'
import { analyzeSelection, planRun } from '../validation/plan.ts'
import { runProgress, type RunState } from '../validation/runState.ts'
import type { RunRequest, ValidatorAdapter } from '../validation/types.ts'

type RunPanelProps = {
  catalogue: Catalogue
  selection: Selection
  adapter: ValidatorAdapter
  document: Record<string, unknown> | null
  run: RunState | null
  onStart: (request: RunRequest) => void
  onCancel: () => void
}

export const RunPanel: React.FC<RunPanelProps> = ({
  catalogue,
  selection,
  adapter,
  document,
  run,
  onStart,
  onCancel,
}) => {
  const { t } = useTranslation()
  // The IDs of the network-enabled tests the user is being asked about. A changed selection asks again.
  const [asked, setAsked] = useState<string | null>(null)

  const analysis = analyzeSelection(catalogue, selection, adapter)
  const selectedCount = analysis.runnable.length + analysis.unavailable.length
  const running = run?.phase === 'running'

  const plan = (networkConfirmed: boolean) =>
    document
      ? planRun({ catalogue, selection, adapter, document, networkConfirmed })
      : null
  const needed = plan(false)
  const networkKey =
    needed?.status === 'needs-confirmation'
      ? needed.networkTests.map((test) => test.id).join(' ')
      : null
  const confirming = networkKey !== null && asked === networkKey

  const start = (networkConfirmed: boolean) => {
    const next = plan(networkConfirmed)
    if (next?.status === 'ready') {
      setAsked(null)
      onStart(next.request)
    } else if (next?.status === 'needs-confirmation') {
      setAsked(next.networkTests.map((test) => test.id).join(' '))
    }
  }

  const canStart =
    document !== null &&
    !running &&
    adapter.availability.available &&
    analysis.runnable.length > 0

  const progress = run ? runProgress(run) : null

  return (
    <section aria-labelledby="run-heading">
      <h2 id="run-heading">{t('run.heading')}</h2>
      <p>
        {t('run.validatorLine', {
          validator: t(`validators.names.${adapter.id}`),
        })}
        {adapter.componentVersion && (
          <> ({t('run.version', { version: adapter.componentVersion })})</>
        )}
      </p>

      {!adapter.availability.available && (
        <p role="alert">
          {t('run.adapterUnavailable', {
            reason: t(adapter.availability.reasonKey),
          })}
        </p>
      )}

      {adapter.limitationKeys.length > 0 && (
        <>
          <h3>{t('run.limitations')}</h3>
          <ul>
            {adapter.limitationKeys.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </>
      )}

      {adapter.availability.available && (
        <p aria-live="polite">
          {analysis.runnable.length === 0
            ? t('run.nothingToRun')
            : t('run.runnable', {
                runnable: analysis.runnable.length,
                selected: selectedCount,
              })}
        </p>
      )}

      {analysis.unavailable.length > 0 && (
        <details>
          <summary>
            {t('run.cannotRun.summary', { count: analysis.unavailable.length })}
          </summary>
          <ul className="cannot-run">
            {analysis.unavailable.map(({ id, capability }) => {
              const test = catalogue.tests.find((entry) => entry.id === id)
              return (
                <li key={id} data-row-id={id}>
                  <strong>
                    {test ? test.section : t('report.table.schemaCheck')}
                  </strong>
                  {test && <> {test.title}</>}
                  {': '}
                  {t(`run.cannotRun.state.${capability.state}`)}.{' '}
                  {capability.reason ?? t('run.cannotRun.noReason')}
                </li>
              )
            })}
          </ul>
        </details>
      )}

      {document === null && <p>{t('run.noDocument')}</p>}

      {confirming && needed?.status === 'needs-confirmation' && (
        <div
          role="alertdialog"
          aria-labelledby="network-heading"
          className="notice"
        >
          <h3 id="network-heading">{t('run.network.heading')}</h3>
          <p>{t('run.network.body')}</p>
          <ul>
            {needed.networkTests.map((test) => (
              <li key={test.id}>
                <strong>{test.section}</strong> {test.title}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => start(true)}>
            {t('run.network.confirm')}
          </button>{' '}
          <button type="button" onClick={() => setAsked(null)}>
            {t('run.network.back')}
          </button>
        </div>
      )}

      {!confirming && (
        <button type="button" disabled={!canStart} onClick={() => start(false)}>
          {t('run.start')}
        </button>
      )}
      {running && (
        <>
          {' '}
          <button type="button" onClick={onCancel}>
            {t('run.cancel')}
          </button>
          <p>{t('run.cancelNote')}</p>
          {progress && (
            <p>
              <progress value={progress.done} max={progress.total} />{' '}
              {t('run.progress', progress)}
            </p>
          )}
        </>
      )}
    </section>
  )
}
