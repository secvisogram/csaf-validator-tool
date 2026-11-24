import { useTranslation } from 'react-i18next'
import {
  countSelected,
  initialSelectionOrigin,
  setSchema,
  toggleTest,
  type Selection,
} from '../catalogue/selection.ts'
import { SafeLink } from './SafeLink.tsx'
import { isNetworkEnabled } from '../catalogue/network.ts'
import type { Catalogue, CatalogueTest } from '../catalogue/types.ts'
import type { Capability, ValidatorAdapter } from '../validation/types.ts'

type CatalogueViewProps = {
  catalogue: Catalogue
  adapter: Pick<ValidatorAdapter, 'capability'>
  selection: Selection
  onChange: (selection: Selection) => void
  onReset: () => void
}

const CapabilityCell: React.FC<{
  capability: Capability
  network?: boolean
}> = ({ capability, network = false }) => {
  const { t } = useTranslation()
  return (
    <>
      <span className={`capability capability-${capability.state}`}>
        {t(`report.capability.${capability.state}`)}
      </span>
      {capability.reason && <div className="reason">{capability.reason}</div>}
      {network && <div className="reason">{t('catalogue.table.network')}</div>}
    </>
  )
}

const SpecificationLink: React.FC<{ test: CatalogueTest }> = ({ test }) => {
  const { t } = useTranslation()
  if (test.specificationUrl === undefined) {
    return <span className="maintenance">{t('catalogue.link.missing')}</span>
  }
  return (
    <SafeLink
      href={test.specificationUrl}
      aria-label={t('catalogue.link.openLabel', { section: test.section })}
    >
      {t('catalogue.link.open')}
    </SafeLink>
  )
}

export const CatalogueView: React.FC<CatalogueViewProps> = ({
  catalogue,
  adapter,
  selection,
  onChange,
  onReset,
}) => {
  const { t } = useTranslation()
  const { schemaCheck } = catalogue
  const schemaHeadingId = `schema-${catalogue.snapshot}`

  return (
    <div>
      <h3>{catalogue.title}</h3>
      <p>
        {t('catalogue.specification')}:{' '}
        <SafeLink href={catalogue.specificationUrl}>
          {catalogue.specificationUrl}
        </SafeLink>
      </p>
      {catalogue.experimental && <p>{t('catalogue.experimental')}</p>}
      <p>{t(`catalogue.initial.${initialSelectionOrigin(catalogue)}`)}</p>
      <p>{t('catalogue.initial.note')}</p>
      <button type="button" onClick={onReset}>
        {t('catalogue.initial.reset')}
      </button>
      <p aria-live="polite">
        {t('catalogue.summary', {
          selected: selection.tests.size,
          total: catalogue.tests.length,
          schema: t(
            selection.schema
              ? 'catalogue.schema.selected'
              : 'catalogue.schema.notSelected',
          ),
        })}
      </p>

      <section aria-labelledby={schemaHeadingId}>
        <h4 id={schemaHeadingId}>{t('catalogue.schema.heading')}</h4>
        <label className="inline-label">
          <input
            type="checkbox"
            checked={selection.schema}
            onChange={(event) =>
              onChange(setSchema(selection, event.target.checked))
            }
          />{' '}
          {t('catalogue.schema.label')}
        </label>
        <div data-row-id={schemaCheck.id}>
          <CapabilityCell capability={adapter.capability(schemaCheck.id)} />
        </div>
        <p>
          {t('catalogue.schema.note')}
          {schemaCheck.formatValidation === 'required' &&
            ` ${t('catalogue.schema.formatValidation')}`}
          {schemaCheck.specificationUrl && (
            <>
              {' '}
              <SafeLink href={schemaCheck.specificationUrl}>
                {t('catalogue.link.open')}
              </SafeLink>
            </>
          )}
        </p>
      </section>

      {catalogue.groups.map((group) => {
        const tests = catalogue.tests.filter((test) => test.group === group)
        const headingId = `group-${catalogue.snapshot}-${group}`
        return (
          <section key={group} aria-labelledby={headingId}>
            <h4 id={headingId}>
              {t(`catalogue.groups.${group}`)} (
              {t('catalogue.table.groupCount', {
                selected: countSelected(selection, tests),
                total: tests.length,
              })}
              )
            </h4>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('catalogue.table.select')}</th>
                  <th scope="col">{t('catalogue.table.section')}</th>
                  <th scope="col">{t('catalogue.table.title')}</th>
                  <th scope="col">{t('catalogue.table.support')}</th>
                  <th scope="col">{t('catalogue.link.open')}</th>
                  <th scope="col">{t('catalogue.table.presets')}</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => (
                  <tr key={test.id} data-row-id={test.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selection.tests.has(test.id)}
                        aria-label={t('catalogue.table.selectTest', {
                          section: test.section,
                          title: test.title,
                        })}
                        onChange={(event) =>
                          onChange(
                            toggleTest(
                              selection,
                              test.id,
                              event.target.checked,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>{test.section}</td>
                    <td>{test.title}</td>
                    <td>
                      <CapabilityCell
                        capability={adapter.capability(test.id)}
                        network={isNetworkEnabled(
                          catalogue.snapshot,
                          test.section,
                        )}
                      />
                    </td>
                    <td>
                      <SpecificationLink test={test} />
                    </td>
                    <td className="presets">{test.memberships.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
