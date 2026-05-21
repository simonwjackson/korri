import type { RuntimeConfigBridgeState } from "../desktop/runtime-config-bridge"
import type { ControllerInputProfile } from "@shared/navigation/controller-profile"
import type { StartSpatialNavigationOptions } from "@shared/navigation/start"

/**
 * Build the spatial-navigation start options from the runtime config
 * snapshot and the controller profile.
 *
 * When `nativeBridgeUrl` is null (host variant or pre-push initial state),
 * `native` is `undefined` and the gamepad adapter handles controller input.
 * When the URL is set, the native input bridge adapter is wired with
 * `subscribe: ["gamepad", "system"]` so inputd is the single authoritative
 * controller backend.
 *
 * Pure helper so portal startup can be unit-tested without a DOM.
 */
export function buildSpatialNavigationConfig(
  runtime: RuntimeConfigBridgeState,
  profile: ControllerInputProfile,
): StartSpatialNavigationOptions {
  return {
    diagnostics: true,
    controller: {
      profile,
      native: runtime.nativeBridgeUrl
        ? {
            url: runtime.nativeBridgeUrl,
            subscribe: ["gamepad", "system"],
          }
        : undefined,
    },
  }
}
