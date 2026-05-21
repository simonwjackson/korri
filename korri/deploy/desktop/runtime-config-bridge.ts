/**
 * Cross-context contract for the desktop's runtime-config push.
 *
 * The bun side (`main.ts`) reads environment-driven configuration at
 * startup (currently the native input-bridge URL, `KORRI_NATIVE_BRIDGE_URL`,
 * set by the device wrap step) and pushes a snapshot into open
 * BrowserWindows via electrobun's bun→webview channel. The preload installs
 * a bridge on `window.__korriRuntime` exposing `getState()` / `subscribe()`;
 * the renderer reads from it instead of `import.meta.env` so the same Vite
 * bundle ships to host and device variants.
 *
 * This module is the single source of truth for the runtime-config wire
 * shape both sides agree on. It must not import anything that ties it to a
 * runtime (bun-only modules, React, etc.) so it can be safely consumed
 * from both the preload and the React renderer.
 */

export interface RuntimeConfigBridgeState {
  readonly nativeBridgeUrl: string | null
}

/**
 * Type guard for the wire-format runtime config. Designed to be extended
 * with additional set-once-at-startup fields without churning the contract
 * shape: every new field should land here with its own guard branch.
 */
export function isRuntimeConfigBridgeState(
  value: unknown,
): value is RuntimeConfigBridgeState {
  if (!isObject(value)) return false
  if (!("nativeBridgeUrl" in value)) return false
  const nativeBridgeUrl = value.nativeBridgeUrl
  return nativeBridgeUrl === null || isString(nativeBridgeUrl)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}
