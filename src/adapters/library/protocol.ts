/** The single message the main thread sends to the library worker. */
export type WorkerRequest = {
  document: unknown
  /** Catalogue IDs of the tests to run. The worker resolves each to a library function. */
  tests: string[]
}
