import {
  createDesktopInputBrokerCore,
  type DesktopInputBrokerCoreOptions,
  type DesktopInputTarget,
} from "@shared/input/desktop-input-broker-core"
import {
  isDesktopInputActionBridgePayload,
  isDesktopInputStatusBridgePayload,
} from "@shared/input/desktop-bridge-wire"

type DesktopInputWindow = {
  readonly title?: string
  readonly webview: {
    readonly executeJavascript: (script: string) => void
    readonly on?: (event: "dom-ready", handler: () => void) => void
  }
}

export interface DesktopInputBrokerOptions
  extends Omit<
    DesktopInputBrokerCoreOptions,
    "getTargets" | "getActiveTarget" | "onActiveChange"
  > {
  readonly getWindows: () => readonly DesktopInputWindow[]
  readonly getActiveWindow: () => DesktopInputWindow | null | undefined
  readonly onActiveChange?: (listener: (active: boolean) => void) => () => void
}

export function createDesktopInputBroker(options: DesktopInputBrokerOptions) {
  return createDesktopInputBrokerCore({
    ...options,
    getTargets: () => options.getWindows().map(windowToTarget),
    getActiveTarget: () => {
      const active = options.getActiveWindow()
      if (active) return windowToTarget(active)

      const windows = options.getWindows()
      return windows.length === 1 ? windowToTarget(windows[0]) : null
    },
    onActiveChange: options.onActiveChange,
  })
}

export function createKorriInputDispatchScript(payload: unknown): string {
  const encoded = encodeDesktopInputBridgePayloadForDispatch(payload)
  return `window.__korriInputDispatch?.(${JSON.stringify(encoded)});`
}

const targetCache = new WeakMap<DesktopInputWindow, DesktopInputTarget>()

function windowToTarget(window: DesktopInputWindow): DesktopInputTarget {
  const cached = targetCache.get(window)
  if (cached) return cached

  const target: DesktopInputTarget = {
    title: window.title,
    sendMessage: payload =>
      window.webview.executeJavascript(createKorriInputDispatchScript(payload)),
    onDomReady: handler => window.webview.on?.("dom-ready", handler),
  }
  targetCache.set(window, target)
  return target
}

function encodeDesktopInputBridgePayloadForDispatch(payload: unknown) {
  if (
    isDesktopInputActionBridgePayload(payload) ||
    isDesktopInputStatusBridgePayload(payload)
  ) {
    return payload
  }
  throw new Error("invalid desktop input bridge payload")
}
