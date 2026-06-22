import { plugin } from "@platform/plugin"
import { KORRI_REMAP_PLUGIN_ID } from "./src/policy"

export { decodeRemapBindings } from "./src/bindings"
export type { RemapBinding } from "./src/bindings"
export {
  isControllerRef,
  parseControlRef,
  type RemapButton,
  type RemapControlRef,
  type RemapControllerControl,
  type RemapControllerRef,
  type RemapDirection,
  type RemapKeyboardRef,
  type RemapPlayerSlot,
  type RemapStick,
} from "./src/control-ref"
export {
  type RemapControllerSourceResolution,
  type RemapResolvedControllerSource,
  type ResolveRemapControllerSourcesOptions,
  resolveRemapControllerSources,
  slugify,
} from "./src/sources"
export {
  KORRI_REMAP_PLUGIN_ID,
  decodeRemapPolicy,
  normalizeRemapPolicy,
  remapPolicyFromLaunch,
  type NormalizedRemapPolicy,
  type RemapControllerPolicy,
  type RemapControllerPreference,
  type RemapPolicy,
  type RemapRawPolicy,
  type RemapSourceKind,
} from "./src/policy"

export interface RemapPluginDiagnostic {
  readonly provider: typeof KORRI_REMAP_PLUGIN_ID
  readonly status: "ok"
  readonly isolation: "wrapper-scoped"
}

export const remapPlugin = plugin({
  namespace: "@korri",
  name: "remap",
  title: "Remap",
  description:
    "Launch-scoped InputPlumber controller remapping for wrapper-launched games.",
  contributes: {
    config: {
      modules: {
        "launch-wrapper": {
          id: "launch-wrapper",
          kind: "launch-wrapper",
          capabilities: ["launch.compose", "launch.wrapper", "input.remap"],
        },
      },
    },
    handlers: [
      {
        id: "remap.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["diagnostics.collect", "input.remap"],
        run: (): RemapPluginDiagnostic => ({
          provider: KORRI_REMAP_PLUGIN_ID,
          status: "ok",
          isolation: "wrapper-scoped",
        }),
      },
    ],
  },
})

if (remapPlugin.id !== KORRI_REMAP_PLUGIN_ID) {
  throw new Error("Remap plugin id mismatch")
}
