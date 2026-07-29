import type { KorriNativeBridgeSurface } from "@contracts/bridge/korri-native-bridge"
import ReactDOM from "react-dom/client"
import {
  createInMemoryLauncherBridge,
  createKorriNativeLauncherBridge,
} from "./bridge/launcher-bridge"
import { createInputBus } from "./input/bus"
import { createKeyboardAdapter } from "./input/keyboard-adapter"
import { createKorriNativeAdapter } from "./input/korri-native-adapter"
import {
  createHttpKorridClient,
  createInMemoryKorridClient,
} from "./korrid/client"
import { LaunchablesRoot } from "./launchables/LaunchablesRoot"
import "./index.css"

declare global {
  interface Window {
    KorriNative?: KorriNativeBridgeSurface
  }
}

// Composition root: this is the one place that knows whether we're inside
// the Android shell (KorriNative injected) or a desktop browser dev session
// (in-memory bridge, keyboard input).
const bus = createInputBus()
bus.use(createKeyboardAdapter())
bus.use(createKorriNativeAdapter())

const bridge = window.KorriNative
  ? createKorriNativeLauncherBridge(window.KorriNative)
  : createInMemoryLauncherBridge()

// The brain: embedded korrid inside the shell, in-memory in browser dev.
// Loopback http from the synthetic https origin is exempt from WebView
// mixed-content blocking (verified on device).
const korridPort = window.KorriNative?.korridPort() ?? -1
const korrid =
  korridPort > 0
    ? createHttpKorridClient(`http://127.0.0.1:${korridPort}`)
    : createInMemoryKorridClient()

const rootElement = document.getElementById("app")
if (!rootElement) throw new Error("#app element not found")

ReactDOM.createRoot(rootElement).render(
  <LaunchablesRoot bus={bus} bridge={bridge} korrid={korrid} />,
)
