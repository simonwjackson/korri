import { describe, expect, it } from "bun:test"
import {
  assertNativeIsolationProbe,
  KORRI_REMAP_RUNNER_USER,
  type NativeRemapIsolationProbe,
} from "./native-sink"

describe("native Remap sink isolation", () => {
  it("accepts the Sobo-proven practical isolation shape", () => {
    const probe: NativeRemapIsolationProbe = {
      targetUser: KORRI_REMAP_RUNNER_USER,
      targetUserReceived: true,
      korriUserReceived: false,
      normalUserReceived: false,
      swaySawDevices: false,
      rootDiagnosticReadersReceived: true,
      cleanupVerified: true,
    }

    expect(() => assertNativeIsolationProbe(probe)).not.toThrow()
  })

  it("fails closed when the target user does not receive keyboard/gamepad output", () => {
    expect(() =>
      assertNativeIsolationProbe({
        targetUser: KORRI_REMAP_RUNNER_USER,
        targetUserReceived: false,
        korriUserReceived: false,
        normalUserReceived: false,
        swaySawDevices: false,
        rootDiagnosticReadersReceived: false,
        cleanupVerified: true,
      }),
    ).toThrow(/target user did not receive/)
  })

  it("fails closed when Korri, Sway, or a normal user observes the synthetic devices", () => {
    const base: NativeRemapIsolationProbe = {
      targetUser: KORRI_REMAP_RUNNER_USER,
      targetUserReceived: true,
      korriUserReceived: false,
      normalUserReceived: false,
      swaySawDevices: false,
      rootDiagnosticReadersReceived: false,
      cleanupVerified: true,
    }

    expect(() =>
      assertNativeIsolationProbe({ ...base, korriUserReceived: true }),
    ).toThrow(/Korri UI/)
    expect(() =>
      assertNativeIsolationProbe({ ...base, normalUserReceived: true }),
    ).toThrow(/normal user/)
    expect(() =>
      assertNativeIsolationProbe({ ...base, swaySawDevices: true }),
    ).toThrow(/Sway/)
  })

  it("fails closed when cleanup cannot be proven", () => {
    expect(() =>
      assertNativeIsolationProbe({
        targetUser: KORRI_REMAP_RUNNER_USER,
        targetUserReceived: true,
        korriUserReceived: false,
        normalUserReceived: false,
        swaySawDevices: false,
        rootDiagnosticReadersReceived: false,
        cleanupVerified: false,
      }),
    ).toThrow(/cleanup/)
  })

  it("rejects launch identities other than the product-owned runner", () => {
    expect(() =>
      assertNativeIsolationProbe({
        targetUser: "korri",
        targetUserReceived: true,
        korriUserReceived: false,
        normalUserReceived: false,
        swaySawDevices: false,
        rootDiagnosticReadersReceived: false,
        cleanupVerified: true,
      }),
    ).toThrow(/korri-remap-runner/)
  })
})
