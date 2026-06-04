import { afterEach, describe, expect, it } from "bun:test"
import { clearEnvironmentCache, getEnvironment } from "./environment"

const originalProcess = globalThis.process
const originalWindowOrigin = window.location.origin

function setWindowOrigin(origin: string) {
  const url = new URL(origin)

  Object.defineProperty(window.location, "origin", {
    value: origin,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "href", {
    value: `${origin}/`,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "hostname", {
    value: url.hostname,
    writable: true,
    configurable: true,
  })
}

afterEach(() => {
  Object.defineProperty(globalThis, "process", {
    value: originalProcess,
    writable: true,
    configurable: true,
  })
  clearEnvironmentCache()
  setWindowOrigin(originalWindowOrigin)
})

describe("getEnvironment", () => {
  it("detects localhost from the browser hostname", () => {
    setWindowOrigin("http://localhost:3000")

    expect(getEnvironment()).toBe("local")
  })

  it("defaults to production when browser hostname and process env are not local", () => {
    Object.defineProperty(globalThis, "process", {
      value: undefined,
      writable: true,
      configurable: true,
    })
    setWindowOrigin("https://example.com")

    expect(getEnvironment()).toBe("production")
  })
})
