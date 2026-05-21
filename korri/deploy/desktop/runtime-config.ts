import type { RuntimeConfigBridgeState } from "./runtime-config-bridge"

/**
 * Build the runtime-config snapshot pushed to webviews at startup.
 *
 * Inputs come from the process environment (set by the wrap step in
 * `nix/korri-desktop/wrap.nix`). The bun side reads once at startup and
 * pushes the result to every BrowserWindow on `dom-ready`, mirroring the
 * connection-state push pattern.
 *
 * Kept side-effect-free so the function can be tested with a synthetic
 * env record.
 */
export function readRuntimeConfigFromEnv(
  env: Record<string, string | undefined>,
): RuntimeConfigBridgeState {
  const raw = env.KORRI_NATIVE_BRIDGE_URL
  const trimmed = typeof raw === "string" ? raw.trim() : ""
  return { nativeBridgeUrl: trimmed === "" ? null : trimmed }
}
