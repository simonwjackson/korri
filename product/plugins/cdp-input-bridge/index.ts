import { plugin } from "@platform/plugin"
import { collectCdpInputBridgeDiagnostics } from "./src/diagnostics"
import { CDP_INPUT_BRIDGE_PLUGIN_ID } from "./src/policy"

export { CDP_INPUT_BRIDGE_PLUGIN_ID } from "./src/policy"
export { createCdpInputBridgeSessionLifecycleHook } from "./src/session-lifecycle-hook"

export const cdpInputBridgePlugin = plugin({
  namespace: "@korri",
  name: "cdp-input-bridge",
  title: "CDP Input Bridge",
  description:
    "Launch-owned InputPlumber controller to Chromium CDP keyboard bridge for keyboard-only web games.",
  contributes: {
    handlers: [
      {
        id: "cdp-input-bridge.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["diagnostics.collect", "input.cdp-bridge"],
        run: context => collectCdpInputBridgeDiagnostics(context.input),
      },
    ],
  },
})

if (cdpInputBridgePlugin.id !== CDP_INPUT_BRIDGE_PLUGIN_ID) {
  throw new Error("CDP input bridge plugin id mismatch")
}
