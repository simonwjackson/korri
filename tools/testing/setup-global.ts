const testEnvDefaults: Record<string, string> = {
  NODE_ENV: "test",
}

Object.entries(testEnvDefaults).forEach(([key, value]) => {
  if (!process.env[key]) {
    process.env[key] = value
  }
})

global.testUtils = {
  resetStorage: () => {
    global.sessionStorage?.clear()
    global.localStorage?.clear()
  },
  setWindowOrigin: (origin: string) => {
    if (global.window?.location) {
      Object.defineProperty(global.window.location, "origin", {
        value: origin,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global.window.location, "href", {
        value: origin + (global.window.location.pathname || "/"),
        writable: true,
        configurable: true,
      })
    }
  },
}

declare global {
  var testUtils: {
    resetStorage: () => void
    setWindowOrigin: (origin: string) => void
  }
  var logger: unknown
}

export const globalTestSetup = {
  resetAll: () => {
    global.testUtils.resetStorage()
  },
}

if (!import.meta.glob) {
  Object.defineProperty(import.meta, "glob", {
    value: () => ({}),
    writable: true,
    configurable: true,
  })
}

const createMockLogger = (): unknown => {
  const mockLogger: Record<string, unknown> = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    trace: () => {},
  }
  mockLogger.child = () => mockLogger
  return mockLogger
}

global.logger = createMockLogger()
