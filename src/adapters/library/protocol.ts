import type { LibraryTestTarget } from './execute.ts'

/** The single message the main thread sends to the library worker. */
export type WorkerRequest = {
  document: unknown
  tests: LibraryTestTarget[]
}
