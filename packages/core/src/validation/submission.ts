import type { ShallowRef } from 'vue'
import type { InternalValidationScope, ScopeValidationResult } from './scope'
import { computed, shallowRef } from 'vue'

export type SubmitCallback = (result: Extract<ScopeValidationResult, { success: true }>, signal: AbortSignal) => unknown | Promise<unknown>

export function createSubmission(scope: InternalValidationScope) {
  const count = shallowRef(0)
  const busy = shallowRef(false)
  let current: { controller: AbortController, promise: Promise<ScopeValidationResult> } | undefined
  scope.onCancel((reason, cause) => {
    current?.controller.abort(reason)
    current = undefined
    if (cause !== 'array')
      publish(count, 0)
    publish(busy, false)
  })

  function handleSubmit(callback: SubmitCallback): () => Promise<ScopeValidationResult> {
    return () => {
      if (scope.signal.aborted)
        return Promise.reject(scope.signal.reason)
      if (current)
        return current.promise
      const controller = new AbortController()
      // Reserve the submission before reactive observers or user callbacks run.
      const promise = Promise.resolve().then(async () => {
        controller.signal.throwIfAborted()
        const result = await scope.validate()
        controller.signal.throwIfAborted()
        if (!result.success)
          return result
        const state = scope.state.value
        if (!state.validated || state.stale) {
          const reason = new Error('The model changed during submission validation')
          reason.name = 'AbortError'
          throw reason
        }
        const issues = scope.readIssues()
        if (issues.length > 0)
          return { success: false as const, issues }
        await untilAborted(Promise.resolve(callback(result, controller.signal)), controller.signal)
        controller.signal.throwIfAborted()
        return result
      }).finally(() => {
        if (current?.controller === controller) {
          current = undefined
          publish(busy, false)
        }
      })
      current = { controller, promise }
      publish(count, count.value + 1)
      if (current?.controller === controller)
        publish(busy, true)
      return promise
    }
  }

  return { isSubmitting: computed(() => busy.value), submitCount: computed(() => count.value), handleSubmit }
}

function publish<Value>(state: ShallowRef<Value>, value: Value): void {
  try {
    state.value = value
  }
  catch {
    // A synchronous observer cannot leave submission state half-updated.
  }
}

function untilAborted<Value>(operation: Promise<Value>, signal: AbortSignal): Promise<Value> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    if (signal.aborted)
      abort()
    else
      signal.addEventListener('abort', abort, { once: true })
    void operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
