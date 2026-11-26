import { describe, expect, it, vi } from 'vitest'
import type { RunEvent } from '../../validation/types.ts'
import { startLibraryRun, type WorkerLike } from './runner.ts'

class FakeWorker implements WorkerLike {
  posted: unknown[] = []
  terminated = false
  onmessage: WorkerLike['onmessage'] = null
  onerror: WorkerLike['onerror'] = null
  onmessageerror: WorkerLike['onmessageerror'] = null
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

const tests = ['csaf-2.0/6.1.1']
const input = { document: { a: 1 }, tests }

function start() {
  const worker = new FakeWorker()
  const events: RunEvent[] = []
  const handle = startLibraryRun(
    input,
    (e) => events.push(e),
    () => worker,
  )
  return { worker, events, handle }
}

describe('startLibraryRun', () => {
  it('sends the document and the exact tests to the worker', () => {
    const { worker } = start()
    expect(worker.posted).toEqual([input])
  })

  it('forwards each event as it arrives', () => {
    const { worker, events } = start()
    worker.emit({ type: 'test-started', id: 'csaf-2.0/6.1.1' })
    expect(events).toEqual([{ type: 'test-started', id: 'csaf-2.0/6.1.1' }])
    expect(worker.terminated).toBe(false)
  })

  it('terminates the worker when the run completes', () => {
    const { worker, events } = start()
    worker.emit({ type: 'completed' })
    expect(events).toEqual([{ type: 'completed' }])
    expect(worker.terminated).toBe(true)
  })

  it('terminates the worker immediately on cancel and reports the cancel once', () => {
    const { worker, events, handle } = start()
    worker.emit({
      type: 'test-error',
      id: 'csaf-2.0/6.1.1',
      message: 'kept',
    })
    handle.cancel()
    handle.cancel()
    expect(worker.terminated).toBe(true)
    expect(events.map((e) => e.type)).toEqual(['test-error', 'cancelled'])
  })

  it('ignores anything the worker posts after a cancel', () => {
    const { worker, events, handle } = start()
    handle.cancel()
    worker.emit({ type: 'completed' })
    worker.emit({ type: 'test-started', id: 'csaf-2.0/6.1.1' })
    expect(events.map((e) => e.type)).toEqual(['cancelled'])
  })

  it('does nothing when cancelled after completion', () => {
    const { worker, events, handle } = start()
    worker.emit({ type: 'completed' })
    handle.cancel()
    expect(events.map((e) => e.type)).toEqual(['completed'])
  })

  it('fails the run when the worker crashes or cannot load', () => {
    const { worker, events } = start()
    worker.onerror?.({ message: 'Script error' } as ErrorEvent)
    expect(events).toEqual([{ type: 'failed', message: 'Script error' }])
    expect(worker.terminated).toBe(true)
  })

  it('gives a fallback message for a worker error without text', () => {
    const { worker, events } = start()
    worker.onerror?.({ message: '' } as ErrorEvent)
    expect(events[0]?.type === 'failed' && events[0].message).toMatch(/worker/i)
  })

  it('fails the run on an unreadable message', () => {
    const { worker, events } = start()
    worker.onmessageerror?.({} as MessageEvent)
    expect(events[0]?.type).toBe('failed')
    expect(worker.terminated).toBe(true)
  })

  it.each([
    ['a string', 'hello'],
    ['null', null],
    ['an unknown type', { type: 'bogus' }],
    ['no type', { id: 'x' }],
  ])('fails the run when the worker posts %s', (_name, data) => {
    const { worker, events } = start()
    worker.emit(data)
    expect(events.map((e) => e.type)).toEqual(['failed'])
    expect(worker.terminated).toBe(true)
  })

  it('fails the run when the worker cannot be created', () => {
    const events: RunEvent[] = []
    const handle = startLibraryRun(
      input,
      (e) => events.push(e),
      () => {
        throw new Error('Workers are not supported')
      },
    )
    expect(events).toEqual([
      { type: 'failed', message: 'Workers are not supported' },
    ])
    expect(() => handle.cancel()).not.toThrow()
  })

  it('uses a separate worker for each run', () => {
    const create = vi.fn(() => new FakeWorker())
    startLibraryRun(input, () => {}, create)
    startLibraryRun(input, () => {}, create)
    expect(create).toHaveBeenCalledTimes(2)
  })
})
