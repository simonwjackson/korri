import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register()

if (
  typeof global.window !== "undefined" &&
  typeof globalThis.window === "undefined"
) {
  ;(globalThis as unknown as { window: Window }).window = global.window
}

if (typeof global.window !== "undefined") {
  const timerFunctionNames = [
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "queueMicrotask",
  ] as const

  for (const fnName of timerFunctionNames) {
    const globalFn = globalThis[fnName]
    if (globalFn && typeof globalFn === "function") {
      Object.defineProperty(global.window, fnName, {
        value: globalFn,
        writable: true,
        configurable: true,
        enumerable: true,
      })
    }
  }
}

if (
  typeof global.window !== "undefined" &&
  !global.window.requestAnimationFrame
) {
  global.window.requestAnimationFrame = (callback: FrameRequestCallback) =>
    setTimeout(callback, 16) as unknown as number
  global.window.cancelAnimationFrame = (id: number) => clearTimeout(id)
}

if (typeof global.window !== "undefined" && !global.window.ResizeObserver) {
  class ResizeObserverShim {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.window.ResizeObserver =
    ResizeObserverShim as unknown as typeof ResizeObserver
}

if (typeof global.window !== "undefined" && !global.window.matchMedia) {
  global.window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  })
}

if (typeof global.window !== "undefined") {
  Object.defineProperty(global.window.location, "origin", {
    value: "http://localhost:3000",
    writable: true,
    configurable: true,
  })

  Object.defineProperty(global.window.location, "href", {
    value: "http://localhost:3000/",
    writable: true,
    configurable: true,
  })

  Object.defineProperty(global.window.location, "hostname", {
    value: "localhost",
    writable: true,
    configurable: true,
  })
}

if (typeof import.meta !== "undefined" && import.meta.env) {
  Object.defineProperty(import.meta.env, "DEV", {
    value: process.env.NODE_ENV !== "production",
    writable: true,
    configurable: true,
  })

  Object.defineProperty(import.meta.env, "PROD", {
    value: process.env.NODE_ENV === "production",
    writable: true,
    configurable: true,
  })

  Object.defineProperty(import.meta.env, "MODE", {
    value: process.env.NODE_ENV || "test",
    writable: true,
    configurable: true,
  })
}
