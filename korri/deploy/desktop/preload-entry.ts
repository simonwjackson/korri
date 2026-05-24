/**
 * Browser-bundled entry point for the desktop preload.
 *
 * Compiled by `bun build --target=browser` and copied into the
 * electrobun app bundle at `Resources/app/views/mainview/preload.js`.
 * Electrobun's built-in preload runs before this one and installs
 * `window.__electrobun`; we then install the input bridge on top so
 * the React renderer can subscribe to brokered semantic input actions.
 *
 * Connection-state and runtime-config used to be installed here too;
 * both are out-of-band now (waiting page + inlined runtime-config) and
 * the preload's only remaining job is the input bridge.
 *
 * Kept as a thin shim so test files can import the library
 * (`./preload.ts`) without triggering side effects on the global
 * window.
 */

import { installDesktopInputBridge } from "./preload.ts"

if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    installDesktopInputBridge(window as Window & typeof globalThis)
  } catch (error) {
    // Preload is best-effort; renderer falls back to a stub when
    // missing.
    console.warn("[korri] preload bridge install failed", error)
  }
}
