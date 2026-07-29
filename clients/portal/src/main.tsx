import {
  SESSION_SCREEN_PARAM,
  SESSION_SCREEN_VALUE,
  type KorriNativeBridgeSurface,
  type KorriSessionBridgeSurface,
} from "@contracts/bridge/korri-native-bridge"
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
import { createSessionLifecycleAdapter } from "./session/lifecycle-adapter"
import {
  createFixtureLifecycleAdapter,
  SessionScreen,
} from "./session/SessionScreen"
import "./index.css"

declare global {
  interface Window {
    KorriNative?: KorriNativeBridgeSurface
    KorriSession?: KorriSessionBridgeSurface
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

// The session screen is the same bundled app booted with a query param
// (treaty: SESSION_SCREEN_PARAM). Inside the stream Activity's overlay the
// shell injects KorriSession; in browser dev a fixture timeline plays.
const isSessionScreen =
  new URLSearchParams(window.location.search).get(SESSION_SCREEN_PARAM) ===
  SESSION_SCREEN_VALUE

if (isSessionScreen) {
  const session = window.KorriSession
  const adapter = session
    ? createSessionLifecycleAdapter(session)
    : createFixtureLifecycleAdapter()
  const exit = () => {
    if (session) session.exitToPortal()
    else window.location.search = ""
  }
  ReactDOM.createRoot(rootElement).render(
    <SessionScreen adapter={adapter} onExit={exit} />,
  )
} else {
  ReactDOM.createRoot(rootElement).render(
    <LaunchablesRoot bus={bus} bridge={bridge} korrid={korrid} />,
  )
}
