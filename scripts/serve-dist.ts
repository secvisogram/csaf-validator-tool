/**
 * Serves `dist` the way GitHub Pages does, for the browser tests: static files
 * under one path, a real 404 for everything else, and no fallback page.
 *
 *   node scripts/serve-dist.ts --port 4174 --path /csaf-validator-tool/
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    path: { type: 'string', default: '/' },
  },
})
const port = Number(values.port)
const mount = values.path as string
const directory = resolve('dist')

if (!Number.isInteger(port) || !mount.startsWith('/') || !mount.endsWith('/')) {
  throw new Error('Usage: serve-dist.ts --port <n> --path </prefix/>')
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.wasm': 'application/wasm',
}

createServer(async (request, response) => {
  const send = (status: number, headers: Record<string, string> = {}) => {
    response.writeHead(status, headers)
    response.end()
  }
  const path = decodeURIComponent(
    new URL(request.url ?? '/', 'http://x').pathname,
  )
  if (path + '/' === mount) return send(301, { Location: mount })
  if (!path.startsWith(mount)) return send(404)

  const relative = normalize(path.slice(mount.length)).replace(
    /^([/\\]|\.\.)+/,
    '',
  )
  let file = join(directory, relative)
  if (file !== directory && !file.startsWith(directory + sep)) return send(404)
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    const body = await readFile(file)
    response.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    })
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch {
    send(404)
  }
}).listen(port, '127.0.0.1')
