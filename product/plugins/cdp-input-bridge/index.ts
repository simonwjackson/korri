import { plugin } from "@platform/plugin"
import { CDP_INPUT_BRIDGE_PLUGIN_ID } from "./src/policy"

export {
  createCdpInputBridgeSessionLifecycleHook,
  type CdpInputBridgeSessionLifecycleHookOptions,
} from "./src/session-lifecycle-hook"
export {
  CDP_INPUT_BRIDGE_PLUGIN_ID,
  decodeCdpInputBridgePolicy,
  policyAnnotationFromMetadata,
  type CdpInputBridgePolicy,
} from "./src/policy"

export const cdpInputBridgePlugin = plugin({
  namespace: "@korri",
  name: "cdp-input-bridge",
  title: "CDP Input Bridge",
  description:
    "Launch-owned InputPlumber controller to Chromium CDP keyboard bridge for keyboard-only web games.",
})

if (cdpInputBridgePlugin.id !== CDP_INPUT_BRIDGE_PLUGIN_ID) {
  throw new Error("CDP input bridge plugin id mismatch")
}
