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
export interface SpatialNavigationConfigOptions {
  readonly isInputActive?: () => boolean
}

export function buildSpatialNavigationConfig(
  runtime: RuntimeConfig,
  profile: ControllerInputProfile,
  options: SpatialNavigationConfigOptions = {},
): StartSpatialNavigationOptions {
  return {
    diagnostics: true,
    controller: {
      profile,
      native:
        runtime.desktopInput && runtime.nativeInputdUrl
          ? {
              url: runtime.nativeInputdUrl,
              isActive: options.isInputActive ?? browserSurfaceIsInputActive,
            }
          : undefined,
      desktop: undefined,
    },
  }
}

export function browserSurfaceIsInputActive(): boolean {
  if (typeof document === "undefined") return true
  return document.visibilityState !== "hidden" && document.hasFocus()
}
