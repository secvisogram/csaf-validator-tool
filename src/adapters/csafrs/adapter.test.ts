import { describe, expect, it, vi } from 'vitest'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import type { RunEvent, RunRequest } from '../../validation/types.ts'
import type { WorkerLike } from '../library/runner.ts'
import { csafRsAdapter } from './adapter.ts'
import type { CsafRsInput } from './execute.ts'

class FakeWorker implements WorkerLike<CsafRsInput> {
  posted: unknown[] = []
  terminated = false
  onmessage: WorkerLike<CsafRsInput>['onmessage'] = null
  onerror: WorkerLike<CsafRsInput>['onerror'] = null
  onmessageerror: WorkerLike<CsafRsInput>['onmessageerror'] = null
  postMessage = (message: unknown) => {
    this.posted.push(message)
  }
  terminate = () => {
    this.terminated = true
  }
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<RunEvent>)
  }
}

const request = (extra: Partial<RunRequest> = {}): RunRequest => ({
  validator: 'csaf-rs-wasm',
  snapshot: 'csaf-2.0',
  runnable: ['csaf-2.0/schema', 'csaf-2.0/6.1.1'],
  selected: ['csaf-2.0/schema', 'csaf-2.0/6.1.1', 'csaf-2.0/6.3.6'],
  document: { document: { csaf_version: '2.0' } },
  ...extra,
})

function setup() {
  const worker = new FakeWorker()
  const createWorker = vi.fn(() => worker)
  const adapter = csafRsAdapter(createWorker)
  const events: RunEvent[] = []
  return { worker, createWorker, adapter, events }
}

describe('the csaf-rs adapter', () => {
  it('is offered as an available adapter with the pinned version', () => {
    const { adapter } = setup()
    expect(adapter.id).toBe('csaf-rs-wasm')
    expect(adapter.availability).toEqual({ available: true })
    expect(adapter.componentVersion).toBe('0.7.3')
  })

  it('creates no worker until a run starts, so the WASM does not load earlier', () => {
    const { createWorker, adapter } = setup()
    expect(createWorker).not.toHaveBeenCalled()
    adapter.capability('csaf-2.0/6.1.1')
    expect(createWorker).not.toHaveBeenCalled()
  })

  it('shows its progress as indeterminate because the package call is synchronous', () => {
    expect(setup().adapter.progress).toBe('indeterminate')
  })

  it('names the full-run limitation before a run', () => {
    expect(setup().adapter.limitationKeys).toContain(
      'validators.csafRs.fullSetFiltered',
    )
  })

  it('reads capability from its own records', () => {
    const { adapter } = setup()
    expect(adapter.capability('csaf-2.0/6.1.1').state).toBe(
      'verified-supported',
    )
    expect(adapter.capability('csaf-2.0/6.3.6').state).toBe('known-unsupported')
  })

  it('sends the document, the snapshot, the runnable tests and the catalogue IDs to one worker', () => {
    const { worker, createWorker, adapter, events } = setup()
    adapter.start(request(), (event) => events.push(event))
    expect(createWorker).toHaveBeenCalledTimes(1)
    const catalogue = CATALOGUES['csaf-2.0']
    expect(worker.posted).toEqual([
      {
        document: { document: { csaf_version: '2.0' } },
        snapshot: 'csaf-2.0',
        tests: ['csaf-2.0/schema', 'csaf-2.0/6.1.1'],
        catalogued: [
          catalogue.schemaCheck.id,
          ...catalogue.tests.map((test) => test.id),
        ],
      },
    ])
  })

  it('does not send unavailable tests to the worker', () => {
    const { worker, adapter, events } = setup()
    adapter.start(request(), (event) => events.push(event))
    expect(JSON.stringify(worker.posted)).not.toContain('6.3.6"]')
    expect((worker.posted[0] as CsafRsInput).tests).not.toContain(
      'csaf-2.0/6.3.6',
    )
  })

  it('forwards worker events and terminates the worker when the run completes', () => {
    const { worker, adapter, events } = setup()
    adapter.start(request(), (event) => events.push(event))
    worker.emit({ type: 'test-started', id: 'csaf-2.0/6.1.1' })
    worker.emit({ type: 'completed' })
    expect(events.map((event) => event.type)).toEqual([
      'test-started',
      'completed',
    ])
    expect(worker.terminated).toBe(true)
  })

  it('terminates the worker on cancel and ignores what it posts afterwards', () => {
    const { worker, adapter, events } = setup()
    const handle = adapter.start(request(), (event) => events.push(event))
    handle.cancel()
    worker.emit({ type: 'test-result', id: 'csaf-2.0/6.1.1' })
    worker.emit({ type: 'completed' })
    expect(worker.terminated).toBe(true)
    expect(events).toEqual([{ type: 'cancelled' }])
  })

  it('keeps no result of a cancelled run, even ones the worker already posted', () => {
    const { worker, adapter, events } = setup()
    const handle = adapter.start(request(), (event) => events.push(event))
    worker.emit({ type: 'test-started', id: 'csaf-2.0/6.1.1' })
    worker.emit({
      type: 'test-result',
      id: 'csaf-2.0/6.1.1',
      outcome: { status: 'succeeded', errors: [], warnings: [], infos: [] },
    })
    handle.cancel()
    expect(events.map((event) => event.type)).toEqual([
      'test-started',
      'cancelled',
    ])
  })

  it('delivers the results together when the run completes', () => {
    const { worker, adapter, events } = setup()
    adapter.start(request(), (event) => events.push(event))
    worker.emit({ type: 'test-started', id: 'csaf-2.0/6.1.1' })
    const result = {
      type: 'test-result',
      id: 'csaf-2.0/6.1.1',
      outcome: { status: 'succeeded', errors: [], warnings: [], infos: [] },
    }
    worker.emit(result)
    expect(events.map((event) => event.type)).toEqual(['test-started'])
    worker.emit({ type: 'completed' })
    expect(events.map((event) => event.type)).toEqual([
      'test-started',
      'test-result',
      'completed',
    ])
  })

  it('discards buffered results when the run fails', () => {
    const { worker, adapter, events } = setup()
    adapter.start(request(), (event) => events.push(event))
    worker.emit({ type: 'test-result', id: 'csaf-2.0/6.1.1' })
    worker.emit({ type: 'failed', message: 'x' })
    expect(events).toEqual([{ type: 'failed', message: 'x' }])
  })

  it('fails the run when the worker fails to load or crashes', () => {
    const { worker, adapter, events } = setup()
    adapter.start(request(), (event) => events.push(event))
    worker.onerror?.({ message: 'Failed to fetch module' } as ErrorEvent)
    expect(events).toEqual([
      { type: 'failed', message: 'Failed to fetch module' },
    ])
    expect(worker.terminated).toBe(true)
  })

  it('fails the run on a malformed worker message', () => {
    const { worker, adapter, events } = setup()
    adapter.start(request(), (event) => events.push(event))
    worker.emit('hello')
    expect(events.map((event) => event.type)).toEqual(['failed'])
  })

  it('fails the run when the worker cannot be created', () => {
    const events: RunEvent[] = []
    const adapter = csafRsAdapter(() => {
      throw new Error('no workers here')
    })
    adapter.start(request(), (event) => events.push(event))
    expect(events).toEqual([{ type: 'failed', message: 'no workers here' }])
  })
})
