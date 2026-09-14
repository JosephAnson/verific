export type RunState<Value>
  = | { readonly status: 'running' }
    | { readonly status: 'superseded', readonly next: Promise<Value> }
    | { readonly status: 'aborted', readonly reason: Error }

export interface ValidationRun<Value> {
  readonly id: number
  readonly controller: AbortController
  readonly promise: Promise<Value>
  state: RunState<Value>
}

const CANCELLED = Object.freeze({ status: 'cancelled' as const })

export function supersedeRun<Value>(run: ValidationRun<Value>, next: Promise<Value>): void {
  if (run.state.status === 'aborted')
    return
  run.state = { status: 'superseded', next }
  run.controller.abort()
}

export function abortRun(run: ValidationRun<unknown>, reason: Error): void {
  // Reset also aborts callers already following a superseding run.
  run.state = { status: 'aborted', reason }
  run.controller.abort(reason)
}

export function throwIfAborted(run: ValidationRun<unknown>): void {
  if (run.state.status === 'aborted')
    throw run.state.reason
}

export async function followLatest<Value>(
  owner: ValidationRun<Value>,
  validation: Promise<Value>,
  latest: () => Promise<Value> | undefined,
): Promise<Value> {
  while (true) {
    let outcome: { value: Value } | { reason: unknown }
    try {
      outcome = { value: await validation }
    }
    catch (reason) {
      outcome = { reason }
    }
    throwIfAborted(owner)
    const next = latest()
    if (next && next !== validation && next !== owner.promise) {
      validation = next
      continue
    }
    if ('reason' in outcome)
      throw outcome.reason
    return outcome.value
  }
}

export function raceCancellation<Value>(
  operation: Promise<Value>,
  signals: readonly AbortSignal[],
): Promise<Value | typeof CANCELLED> {
  return new Promise((resolve) => {
    const finish = (value: Value | typeof CANCELLED) => {
      for (const signal of signals)
        signal.removeEventListener('abort', cancel)
      resolve(value)
    }
    function cancel(): void {
      finish(CANCELLED)
    }
    for (const signal of signals) {
      if (signal.aborted) {
        cancel()
        break
      }
      signal.addEventListener('abort', cancel, { once: true })
    }
    // Schema failures are already represented as settled validation outcomes.
    void operation.then(finish)
  })
}
