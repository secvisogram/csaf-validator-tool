/**
 * The same build, served the two ways it is deployed: at the root (Compose)
 * and under a repository project path (GitHub Pages). Each is its own server,
 * so a root-absolute URL in the build fails under the project path instead of
 * being served from the root.
 */
export const PROJECT_PATH = '/csaf-validator-tool/'

export const SITES = [
  { name: 'at the root', path: '/', port: 4173, url: 'http://127.0.0.1:4173/' },
  {
    name: 'under a project path',
    path: PROJECT_PATH,
    port: 4174,
    url: `http://127.0.0.1:4174${PROJECT_PATH}`,
  },
] as const
