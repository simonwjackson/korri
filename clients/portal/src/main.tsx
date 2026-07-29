import type { KorriNativeBridgeSurface } from "@contracts/bridge/korri-native-bridge"
import ReactDOM from "react-dom/client"
import {
  createInMemoryLauncherBridge,
  createKorriNativeLauncherBridge,
} from "./bridge/launcher-bridge"
import { createInputBus } from "./input/bus"
import { createKeyboardAdapter } from "./input/keyboard-adapter"
import { createKorriNativeAdapter } from "./input/korri-native-adapter"
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

const rootElement = document.getElementById("app")
if (!rootElement) throw new Error("#app element not found")

ReactDOM.createRoot(rootElement).render(
  <LaunchablesRoot bus={bus} bridge={bridge} />,
)
