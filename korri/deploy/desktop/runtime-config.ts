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
  return { desktopInput: env.KORRI_DESKTOP_INPUT_BRIDGE !== "0" }
}
