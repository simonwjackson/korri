import type { ControllerInputProfile } from "@platform/browser/navigation/controller-profile"
import type { StartSpatialNavigationOptions } from "@platform/browser/navigation/start"
import type { RuntimeConfig } from "../desktop/runtime-config-shape"

/**
 * Build the spatial-navigation start options from the runtime config snapshot
 * and the controller profile.
 *
 * Desktop packaged runs receive brokered semantic actions from Electrobun main
 * through `window.__korriInput`; non-desktop/dev runs keep browser gamepad input.
 * The renderer never receives the raw inputd URL.
 */
export function buildSpatialNavigationConfig(
  runtime: RuntimeConfig,
  profile: ControllerInputProfile,
): StartSpatialNavigationOptions {
  return {
    diagnostics: true,
    controller: {
      profile,
      desktop: runtime.desktopInput ? {} : undefined,
    },
  }
}
