/**
 * Browser-bundled entry point for the desktop preload.
 *
 * Compiled by `bun build --target=browser` and copied into the electrobun
 * app bundle at `Resources/app/views/mainview/preload.js`. Electrobun's
 * built-in preload runs before this one and installs `window.__electrobun`;
 * we then install our bridge unconditionally so the React shell can
 * observe connection-state pushes from bun.
 *
 * Kept as a thin shim so test files can import the library
 * (`./preload.ts`) without triggering side effects on the global window.
 */

import {
  installConnectionStateBridge,
  installRuntimeBridge,
} from "./preload.ts"

if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    installConnectionStateBridge(window as Window & typeof globalThis)
    installRuntimeBridge(window as Window & typeof globalThis)
  } catch (error) {
    // Preload is best-effort; renderer falls back to a stub when missing.
    console.warn("[korri] preload bridge install failed", error)
  }
}
