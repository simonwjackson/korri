import {
  createDesktopInputBrokerCore,
  type DesktopInputBrokerCoreOptions,
  type DesktopInputTarget,
} from "@shared/input/desktop-input-broker-core"

type DesktopInputWindow = {
  readonly title?: string
  readonly webview: {
    readonly sendMessageToWebviewViaExecute: (payload: unknown) => void
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
      return active ? windowToTarget(active) : null
    },
    onActiveChange: options.onActiveChange,
  })
}

const targetCache = new WeakMap<DesktopInputWindow, DesktopInputTarget>()

function windowToTarget(window: DesktopInputWindow): DesktopInputTarget {
  const cached = targetCache.get(window)
  if (cached) return cached

  const target: DesktopInputTarget = {
    title: window.title,
    sendMessage: payload =>
      window.webview.sendMessageToWebviewViaExecute(payload),
    onDomReady: handler => window.webview.on?.("dom-ready", handler),
  }
  targetCache.set(window, target)
  return target
}
