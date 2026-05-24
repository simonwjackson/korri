import { LauncherLayerBridge } from "@app/features/home/launcher-layer-bridge"
import { LauncherLayerRpc } from "@app/features/home/launcher-layer-rpc"
import type { Launcher } from "@shared/library/library-services"
import type { Layer } from "effect"
import type { RuntimeConfig } from "../desktop/runtime-config-shape"

/**
 * Pure selection rule used at the React composition root.
 *
 * The desktop deploy inlines `{ desktopInput: true }` into the served
 * `index.html`; the portal deploy serves an unbranded `index.html` and
 * `readInlinedRuntimeConfig` returns the default
 * `{ desktopInput: false }`. The rule maps that one bit to the
 * Launcher layer the React tree should be seeded with via
 * `<RegistryProvider initialValues={…}>`.
 *
 * Kept as its own seam (rather than inlined in `main.tsx`) so the
 * mapping is unit-testable and so the rule has somewhere to grow if
 * additional runtime-config fields ever influence layer selection.
 */
export function selectLauncherLayer(
  runtime: RuntimeConfig,
): Layer.Layer<Launcher> {
  return runtime.desktopInput ? LauncherLayerBridge : LauncherLayerRpc
}
