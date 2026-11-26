import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const root = resolve(import.meta.dirname, '../..')

export const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

/** The configuration without its comments, so a comment never satisfies or breaks a check. */
export const withoutComments = (conf: string) => conf.replace(/^\s*#.*$/gm, '')

/** The body of a top-level `location` of an nginx server block. Throws when it is missing. */
export function locationBlock(conf: string, selector: string): string {
  const start = conf.search(
    new RegExp(
      `^\\s*location\\s+${selector.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*\\{`,
      'm',
    ),
  )
  if (start < 0) throw new Error(`No location ${selector}`)
  const open = conf.indexOf('{', start)
  let depth = 0
  for (let i = open; i < conf.length; i++) {
    if (conf[i] === '{') depth++
    if (conf[i] === '}' && --depth === 0) return conf.slice(open + 1, i)
  }
  throw new Error(`Unterminated location ${selector}`)
}
