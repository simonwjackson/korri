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
