/**
 * @deprecated Use `./runtime-config-shape` instead. This module is a
 * transitional re-export to keep the preload-side files (which are
 * deleted in U6/U7) compiling during the refactor. The bridge framing
 * is gone: runtime-config is now inlined into the served `index.html`
 * synchronously, not pushed via electrobun IPC.
 */

export {
  isRuntimeConfig as isRuntimeConfigBridgeState,
  type RuntimeConfig as RuntimeConfigBridgeState,
} from "./runtime-config-shape"
