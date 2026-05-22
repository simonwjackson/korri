import type { RuntimeConfigBridgeState } from "./runtime-config-bridge"

/**
 * Build the runtime-config snapshot pushed to webviews at startup.
 *
 * Inputs come from the process environment (set by the wrap step in
 * `nix/korri-desktop/wrap.nix`). The bun side reads once at startup and
 * pushes the result to every BrowserWindow on `dom-ready`, mirroring the
 * connection-state push pattern.
 *
 * Kept side-effect-free so the function can be tested with a synthetic env
 * record.
 */
export function readRuntimeConfigFromEnv(
  env: Record<string, string | undefined>,
): RuntimeConfigBridgeState {
  return { desktopInput: isDesktopInputEnabled(env) }
}

export function isDesktopInputEnabled(
  env: Record<string, string | undefined>,
): boolean {
  if (env.KORRI_DESKTOP_INPUT_BRIDGE === "0") return false
  return (
    env.KORRI_DESKTOP_PROFILE === "device" ||
    hasValue(env.KORRI_DESKTOP_INPUTD_URL) ||
    hasValue(env.KORRI_INPUT_BRIDGE_URL)
  )
}

export function desktopInputdUrlFromEnv(
  env: Record<string, string | undefined>,
): string | undefined {
  if (!isDesktopInputEnabled(env)) return undefined
  return (
    trimmedValue(env.KORRI_DESKTOP_INPUTD_URL) ??
    trimmedValue(env.KORRI_INPUT_BRIDGE_URL) ??
    "ws://127.0.0.1:3002"
  )
}

function hasValue(value: string | undefined): boolean {
  return trimmedValue(value) !== undefined
}

function trimmedValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}
