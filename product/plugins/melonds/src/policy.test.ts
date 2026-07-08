import { describe, expect, it } from "bun:test"
import { AppMaterializationFailed } from "@platform/library/config/errors"
import { decodeMelonDsPolicy } from "./policy"

describe("melonDS policy", () => {
  it("decodes an empty policy", () => {
    expect(decodeMelonDsPolicy(undefined)).toEqual({})
  })

  it("accepts the v1 display and video policy surface", () => {
    expect(
      decodeMelonDsPolicy({
        state: { root: "/var/lib/korri/melonDS" },
        boot: { direct: true },
        display: {
          mode: "dual-window",
          sizing: "auto",
          gap: 48,
          swap: true,
          integerScaling: true,
        },
        video: {
          fullscreen: true,
          renderer: "opengl-compute",
          scaleFactor: 3,
        },
      }),
    ).toEqual({
      state: { root: "/var/lib/korri/melonDS" },
      boot: { direct: true },
      display: {
        mode: "dual-window",
        sizing: "auto",
        gap: 48,
        swap: true,
        integerScaling: true,
      },
      video: {
        fullscreen: true,
        renderer: "opengl-compute",
        scaleFactor: 3,
      },
    })
  })

  it("rejects unknown keys and invalid screen gaps", () => {
    expectPolicyError(() => decodeMelonDsPolicy({ command: "melonDS" }))
    expectPolicyError(() => decodeMelonDsPolicy({ display: { gap: -1 } }))
    expectPolicyError(() => decodeMelonDsPolicy({ display: { gap: 501 } }))
  })
})

function expectPolicyError(run: () => unknown): void {
  try {
    run()
    throw new Error("expected policy decode to fail")
  } catch (error) {
    expect(error).toBeInstanceOf(AppMaterializationFailed)
    expect((error as AppMaterializationFailed).reason).toContain(
      "@korri:melonds policy is invalid",
    )
  }
}

it("accepts matched dual-screen presentation geometry", () => {
  expect(
    decodeMelonDsPolicy({
      display: { mode: "dual-window" },
      presentation: {
        intent: "matched-dual-screen",
        menu: { hide: true },
        input: { profile: "inputplumber-xbox" },
        wayland: {
          display: "wayland-1",
          compositorSocket: "/run/user/1000/sway-ipc.sock",
        },
        windows: {
          top: { output: "TOP", x: 407, y: 250, width: 1106, height: 830 },
          bottom: { output: "BOTTOM", x: 0, y: 0, width: 1240, height: 930 },
        },
        secondaryOutput: { output: "BOTTOM", restore: "observed" },
      },
    }),
  ).toMatchObject({
    display: { mode: "dual-window" },
    presentation: {
      intent: "matched-dual-screen",
      menu: { hide: true },
      input: { profile: "inputplumber-xbox" },
    },
  })
})

it("rejects incomplete matched presentation policy", () => {
  expectPolicyError(() =>
    decodeMelonDsPolicy({
      presentation: {
        intent: "matched-dual-screen",
        windows: {
          top: { output: "TOP", x: 0, y: 0, width: 256, height: 192 },
        },
      },
    }),
  )
  expectPolicyError(() =>
    decodeMelonDsPolicy({
      presentation: {
        intent: "matched-dual-screen",
        input: { profile: "ps5" },
      },
    }),
  )
})

it("rejects matched presentation when display mode explicitly conflicts", () => {
  expectPolicyError(() =>
    decodeMelonDsPolicy({
      display: { mode: "vertical" },
      presentation: {
        intent: "matched-dual-screen",
        windows: {
          top: { output: "TOP", x: 0, y: 0, width: 256, height: 192 },
          bottom: { output: "BOTTOM", x: 0, y: 0, width: 256, height: 192 },
        },
      },
    }),
  )
})
