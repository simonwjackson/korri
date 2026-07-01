/**
 * Cross-context contract for the desktop's runtime-config.
 *
 * The bun side (`main.ts`) reads environment-driven configuration at
 * startup and inlines a snapshot into the served `index.html` as a
 * `<script>window.__korriRuntimeConfig = {…}</script>` tag. The
 * renderer (`product/apps/portal/main.tsx`) reads the global at boot
 * via `readInlinedRuntimeConfig(window)` — no polling, no bridge.
 *
 * This module is the single source of truth for the runtime-config wire
 * shape both sides agree on. It must not import anything that ties it
 * to a runtime (bun-only modules, React, etc.) so it can be safely
 * consumed from both the bun composition (`create-desktop-app.ts`) and
 * the React renderer.
 */

export type LiveUsbArtifact = "product" | "developer"

export interface RuntimeConfig {
  readonly desktopInput: boolean
  readonly nativeInputdUrl?: string
  readonly liveUsbArtifact?: LiveUsbArtifact
}

/**
 * Type guard for the wire-format runtime config. Designed to be
 * extended with additional set-once-at-startup fields without churning
 * the contract shape: every new field should land here with its own
 * guard branch.
 */
export function isRuntimeConfig(value: unknown): value is RuntimeConfig {
  if (!isObject(value)) return false
  if (value.desktopInput !== true && value.desktopInput !== false) return false
  if (value.nativeInputdUrl !== undefined && typeof value.nativeInputdUrl !== "string") {
    return false
  }
  if (
    value.liveUsbArtifact !== undefined &&
    value.liveUsbArtifact !== "product" &&
    value.liveUsbArtifact !== "developer"
  ) {
    return false
  }
  return true
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
