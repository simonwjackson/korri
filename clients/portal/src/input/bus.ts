import type { InputAction, InputAdapter, InputListener } from "./types"

/**
 * Pub/sub bus for InputActions. Adapters push, consumers subscribe.
 *
 * Intentionally framework-free. The bus has no opinion about focus, routing,
 * or rendering. It's a cable, not an engine.
 */

export interface InputBus {
  /** Subscribe to all actions. Returns an unsubscribe fn. */
  on(listener: InputListener): () => void
  /** Subscribe to a specific action type. Returns an unsubscribe fn. */
  onAction<T extends InputAction["type"]>(
    type: T,
    listener: (action: Extract<InputAction, { type: T }>) => void,
  ): () => void
  /** Attach an input adapter. Returns a disposer that detaches it. */
  use(adapter: InputAdapter): () => void
  /** Emit an action directly. Useful for tests and synthetic input. */
  emit(action: InputAction): void
  /** Detach all adapters and listeners. */
  dispose(): void
}

export function createInputBus(): InputBus {
  const listeners = new Set<InputListener>()
  const adapterDisposers = new Set<() => void>()

  const emit: InputListener = action => {
    // Snapshot to allow listeners to unsubscribe themselves during dispatch.
    for (const listener of [...listeners]) listener(action)
  }

  return {
    on(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onAction(type, listener) {
      const wrapped: InputListener = action => {
        if (action.type === type) {
          listener(action as Extract<InputAction, { type: typeof type }>)
        }
      }
      listeners.add(wrapped)
      return () => {
        listeners.delete(wrapped)
      }
    },
    use(adapter) {
      const dispose = adapter.start(emit)
      adapterDisposers.add(dispose)
      return () => {
        dispose()
        adapterDisposers.delete(dispose)
      }
    },
    emit,
    dispose() {
      for (const dispose of adapterDisposers) dispose()
      adapterDisposers.clear()
      listeners.clear()
    },
  }
}
