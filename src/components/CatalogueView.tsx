import { useTranslation } from 'react-i18next'
import {
  countSelected,
  initialSelectionOrigin,
  setSchema,
  toggleTest,
  type Selection,
} from '../catalogue/selection.ts'
import type { Catalogue, CatalogueTest } from '../catalogue/types.ts'

type CatalogueViewProps = {
  catalogue: Catalogue
  selection: Selection
  onChange: (selection: Selection) => void
  onReset: () => void
}

const SpecificationLink: React.FC<{ test: CatalogueTest }> = ({ test }) => {
  const { t } = useTranslation()
  if (test.specificationUrl === undefined) {
    return <span className="maintenance">{t('catalogue.link.missing')}</span>
  }
  return (
    <a
      href={test.specificationUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={t('catalogue.link.openLabel', { section: test.section })}
    >
      {t('catalogue.link.open')}
    </a>
  )
}

export const CatalogueView: React.FC<CatalogueViewProps> = ({
  catalogue,
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
        <a href={catalogue.specificationUrl} target="_blank" rel="noreferrer">
          {catalogue.specificationUrl}
        </a>
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
        <p>
          {t('catalogue.schema.note')}
          {schemaCheck.formatValidation === 'required' &&
            ` ${t('catalogue.schema.formatValidation')}`}
          {schemaCheck.specificationUrl && (
            <>
              {' '}
              <a
                href={schemaCheck.specificationUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t('catalogue.link.open')}
              </a>
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
                  <th scope="col">{t('catalogue.link.open')}</th>
                  <th scope="col">{t('catalogue.table.presets')}</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => (
                  <tr key={test.id}>
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
