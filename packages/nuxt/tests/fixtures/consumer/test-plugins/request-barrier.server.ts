interface RequestBatch {
  readonly promise: Promise<void>
  readonly resolve: () => void
  readonly timeout: ReturnType<typeof setTimeout>
  arrivals: number
}

const expectedRequests = 4
const timeoutMilliseconds = 15_000
let activeBatch: RequestBatch | undefined

export default defineNuxtPlugin(() => ({
  provide: {
    requestBarrier: (locale: string) => {
      const batch = activeBatch ?? createBatch()
      activeBatch = batch
      batch.arrivals += 1
      console.warn(`[Verific test barrier] arrived ${locale} ${batch.arrivals}/${expectedRequests}`)

      if (batch.arrivals === expectedRequests) {
        clearTimeout(batch.timeout)
        activeBatch = undefined
        console.warn(`[Verific test barrier] released ${batch.arrivals}/${expectedRequests}`)
        batch.resolve()
      }
      return batch.promise
    },
  },
}))

function createBatch(): RequestBatch {
  let resolveBatch!: () => void
  let rejectBatch!: (error: Error) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolveBatch = resolve
    rejectBatch = reject
  })
  const batch = {
    promise,
    resolve: resolveBatch,
    arrivals: 0,
    timeout: setTimeout(() => {
      clearBatch(batch)
      rejectBatch(new Error(`Verific test barrier timed out before ${expectedRequests} requests arrived.`))
    }, timeoutMilliseconds),
  }
  return batch
}

function clearBatch(batch: RequestBatch): void {
  clearTimeout(batch.timeout)
  if (activeBatch === batch) {
    activeBatch = undefined
  }
}
