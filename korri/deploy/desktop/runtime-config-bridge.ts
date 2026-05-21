/**
 * Cross-context contract for the desktop's runtime-config push.
 *
 * The bun side (`main.ts`) reads environment-driven configuration at startup
 * and pushes a snapshot into open BrowserWindows via electrobun's bun→webview
 * channel. The preload installs a bridge on `window.__korriRuntime` exposing
 * `getState()` / `subscribe()`; the renderer reads from it instead of
 * `import.meta.env` so the same Vite bundle ships to host and device variants.
 *
 * This module is the single source of truth for the runtime-config wire shape
 * both sides agree on. It must not import anything that ties it to a runtime
 * (bun-only modules, React, etc.) so it can be safely consumed from both the
 * preload and the React renderer.
 */

export interface RuntimeConfigBridgeState {
  readonly desktopInput: boolean
}

/**
 * Type guard for the wire-format runtime config. Designed to be extended with
 * additional set-once-at-startup fields without churning the contract shape:
 * every new field should land here with its own guard branch.
 */
export function isRuntimeConfigBridgeState(
  value: unknown,
): value is RuntimeConfigBridgeState {
  if (!isObject(value)) return false
  return value.desktopInput === true || value.desktopInput === false
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
