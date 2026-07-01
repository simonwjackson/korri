import type { ControllerInputProfile } from "@platform/browser/navigation/controller-profile"
import type { StartSpatialNavigationOptions } from "@platform/browser/navigation/start"
import type { RuntimeConfig } from "../desktop/runtime-config-shape"

/**
 * Build the spatial-navigation start options from the runtime config snapshot
 * and the controller profile.
 *
 * Device/kiosk packaged runs receive normalized controller actions directly
 * from inputd through the page-side native WebSocket adapter. Non-desktop/dev
 * runs keep browser gamepad input.
 */
export function buildSpatialNavigationConfig(
  runtime: RuntimeConfig,
  profile: ControllerInputProfile,
): StartSpatialNavigationOptions {
  return {
    diagnostics: true,
    controller: {
      profile,
      native:
        runtime.desktopInput && runtime.nativeInputdUrl
          ? { url: runtime.nativeInputdUrl }
          : undefined,
      desktop: undefined,
    },
  }
}
