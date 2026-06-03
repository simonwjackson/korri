/**
 * Input-mode store: single source of truth for whether the user is currently
 * driving the UI with a pointer (mouse) or with directional input (keyboard /
 * gamepad). Owns the `[data-input-mode]` attribute on `<html>`, which the
 * theme reads to (a) show or hide the cursor and (b) drive the unified
 * active-tile focus rule.
 *
 * The store does NOT subscribe to the input bus directly. The wiring lives in
 * `@platform/browser/navigation/start`, which translates bus actions into setter calls
 * via the source-tag dispatch matrix (see plan unit 5). Keeping the store
 * free of bus knowledge means adapters and tests can manipulate mode without
 * understanding the bus' subscription shape.
 *
 * SSR safety: every DOM access is guarded so importing this module in a
 * non-browser environment (Bun unit-test default, server bundle) does not
 * throw. In-memory state is still maintained; the DOM write is skipped.
 */

export type InputMode = "pointer" | "directional"

export type InputModeListener = (mode: InputMode) => void

export interface InputModeStore {
  getMode(): InputMode
  setPointerMode(): void
  setDirectionalMode(): void
  subscribe(listener: InputModeListener): () => void
  /**
   * Tear down the store: clear listeners and remove the `[data-input-mode]`
   * attribute. The next `createInputModeStore()` writes a fresh initial
   * value so HMR / restart paths produce a clean DOM state.
   */
  dispose(): void
}

export interface CreateInputModeStoreOptions {
  /** Initial mode. Defaults to "pointer" — the first directional input flips it. */
  readonly initialMode?: InputMode
}

const ATTRIBUTE_NAME = "data-input-mode"

function hasDocument(): boolean {
  return typeof document !== "undefined" && document.documentElement !== null
}

function writeAttribute(mode: InputMode): void {
  if (!hasDocument()) return
  document.documentElement.setAttribute(ATTRIBUTE_NAME, mode)
}

function clearAttribute(): void {
  if (!hasDocument()) return
  document.documentElement.removeAttribute(ATTRIBUTE_NAME)
}

export function createInputModeStore(
  options: CreateInputModeStoreOptions = {},
): InputModeStore {
  let mode: InputMode = options.initialMode ?? "pointer"
  const listeners = new Set<InputModeListener>()
  writeAttribute(mode)

  const setMode = (next: InputMode): void => {
    if (mode === next) return
    mode = next
    writeAttribute(mode)
    for (const listener of [...listeners]) listener(mode)
  }

  return {
    getMode: () => mode,
    setPointerMode: () => setMode("pointer"),
    setDirectionalMode: () => setMode("directional"),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      listeners.clear()
      clearAttribute()
    },
  }
}
