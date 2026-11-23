/**
 * Maintainer script. Refreshes the checked-in catalogue baselines from the
 * pinned external sources so a reviewer can diff them. CI never runs it and
 * needs no network access. It does not touch the catalogue itself.
 *
 *   node scripts/refresh-baselines.ts
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SOURCES = [
  {
    snapshot: 'csaf-2.0',
    specificationUrl:
      'https://docs.oasis-open.org/csaf/csaf/v2.0/os/csaf-v2.0-os.html',
    manifestPath: 'csaf_2.0/test/validator/data/testcases.json',
    manifestCommit: 'b9a63f992d0e5f0a98dd5288dbbd2253726809b5',
  },
  {
    snapshot: 'csaf-2.1-csd04',
    specificationUrl:
      'https://docs.oasis-open.org/csaf/csaf/v2.1/csd04/csaf-v2.1-csd04.html',
    manifestPath: 'csaf_2.1/test/validator/data/testcases.json',
    manifestCommit: '3753a070b7ea0394c219de3eb2d1359f8b2f5393',
  },
]

/** Numbered tests and their parents (6.1 to 6.3), format validation (2.2), basic validator clause (9.1.14). */
const RELEVANT_SECTION = /^(6\.[123]\.\d+(\.\d+)*|2\.2|9\.1\.14)$/

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Section number to fragment, as linked from the document's table of contents. */
function tableOfContents(html: string): Map<string, string> {
  const links = new Map<string, string>()
  const add = (section?: string, fragment?: string) => {
    if (section && fragment && !links.has(section)) links.set(section, fragment)
  }
  for (const m of html.matchAll(/<li>(\d+(?:\.\d+)*)\.? ?<a href="#([^"]+)">/g))
    add(m[1], m[2])
  for (const m of html.matchAll(/<li><a href="#([^"]+)">(\d+(?:\.\d+)*)\.? /g))
    add(m[2], m[1])
  return links
}

function extractHeadings(html: string) {
  const links = tableOfContents(html)
  const occurrences = new Map<string, number>()
  for (const m of html.matchAll(/\sid=['"]([^'"]+)['"]/g)) {
    const id = m[1] ?? ''
    occurrences.set(id, (occurrences.get(id) ?? 0) + 1)
  }

  const headings = []
  for (const m of html.matchAll(
    /<h([2-6])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g,
  )) {
    const headingId = m[2] ?? ''
    const inner = m[3] ?? ''
    const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim()
    const numbered = /^(\d+(?:\.\d+)*)\s+(.*)$/.exec(text)
    const section = numbered?.[1]
    const title = numbered?.[2]
    if (!section || !title || !RELEVANT_SECTION.test(section)) continue

    const ids = new Set([headingId])
    for (const a of inner.matchAll(/<a id='([^']+)'/g)) ids.add(a[1] ?? '')
    const fragment = links.get(section)
    if (!fragment || !ids.has(fragment)) {
      throw new Error(
        `${section}: table-of-contents link is not an id of the heading`,
      )
    }
    // The heading id and an identical inner anchor id may repeat within the heading itself.
    const repeatsInHeading =
      (headingId === fragment ? 1 : 0) +
      (inner.includes(`id='${fragment}'`) ? 1 : 0)
    if ((occurrences.get(fragment) ?? 0) !== repeatsInHeading) {
      throw new Error(
        `${section}: fragment #${fragment} is not unique in the document`,
      )
    }
    headings.push({
      section,
      title,
      fragment,
      ids: [...ids].filter(
        (id) => id === headingId || occurrences.get(id) === 1,
      ),
    })
  }
  return headings
}

const sectionKey = (section: string) => section.split('.').map(Number)
function bySection(a: { section: string }, b: { section: string }) {
  const [x, y] = [sectionKey(a.section), sectionKey(b.section)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1)
    if (d !== 0) return d
  }
  return 0
}

const baselineDir = new URL('../src/catalogue/baselines/', import.meta.url)
const retrieved = new Date().toISOString().slice(0, 10)

for (const source of SOURCES) {
  const manifest = JSON.parse(
    await fetchText(
      `https://raw.githubusercontent.com/oasis-tcs/csaf/${source.manifestCommit}/${source.manifestPath}`,
    ),
  ) as { tests: { id: string; group: string }[] }
  await writeFile(
    new URL(`oasis-manifest-${source.snapshot}.json`, baselineDir),
    `${JSON.stringify({
      snapshot: source.snapshot,
      source: {
        repository: 'https://github.com/oasis-tcs/csaf',
        path: source.manifestPath,
        commit: source.manifestCommit,
        retrieved,
      },
      tests: manifest.tests.map(({ id, group }) => ({ id, group })),
    })}\n`,
  )

  const headings = extractHeadings(await fetchText(source.specificationUrl))
  const numbered = headings
    .filter((h) => h.section.startsWith('6.'))
    .sort(bySection)
  const others = headings
    .filter((h) => !h.section.startsWith('6.'))
    .sort(bySection)
  await writeFile(
    new URL(`spec-anchors-${source.snapshot}.json`, baselineDir),
    `${JSON.stringify({
      snapshot: source.snapshot,
      specificationUrl: source.specificationUrl,
      retrieved,
      headings: [...numbered, ...others],
    })}\n`,
  )
  console.log(
    `${source.snapshot}: ${manifest.tests.length} tests, ${headings.length} headings`,
  )
}
console.log(`Baselines written to ${fileURLToPath(baselineDir)}`)
