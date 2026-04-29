type FlushFn<T> = (items: readonly T[]) => Promise<void>

/**
 * Coalesces items pushed within the same microtask into a single flush.
 */
export function createMicrotaskBatchQueue<T>(flush: FlushFn<T>) {
  let pending: T[] = []
  let scheduled = false

  const scheduleFlush = () => {
    if (scheduled) {
      return
    }

    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      const batch = pending
      pending = []
      if (batch.length === 0) {
        return
      }
      void flush(batch)
    })
  }

  return {
    push(item: T) {
      pending.push(item)
      scheduleFlush()
    },
  }
}
