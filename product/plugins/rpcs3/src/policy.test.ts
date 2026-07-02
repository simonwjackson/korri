import { describe, expect, it } from "bun:test"
import { AppMaterializationFailed } from "@platform/library/config/errors"
import { KORRI_RPCS3_PLUGIN_ID } from "./ids"
import { decodeRpcs3Policy } from "./policy"

describe("decodeRpcs3Policy", () => {
  it("accepts state, firmware, env, and extra arguments", () => {
    expect(
      decodeRpcs3Policy({
        command: "/run/current-system/sw/bin/rpcs3",
        state: { root: "{storage:@korri:rpcs3/state}" },
        firmware: { sentinel: "dev_flash/sys/external/liblv2.sprx" },
        env: { WAYLAND_DISPLAY: "wayland-1" },
        extra: { args: ["--some-flag"] },
      }),
    ).toEqual({
      command: "/run/current-system/sw/bin/rpcs3",
      state: { root: "{storage:@korri:rpcs3/state}" },
      firmware: { sentinel: "dev_flash/sys/external/liblv2.sprx" },
      env: { WAYLAND_DISPLAY: "wayland-1" },
      extra: { args: ["--some-flag"] },
    })
  })

  it("rejects malformed policy values with an actionable plugin error", () => {
    expectPolicyError(
      () => decodeRpcs3Policy({ state: { root: 42 } }),
      `${KORRI_RPCS3_PLUGIN_ID} policy state.root must be a string`,
    )
    expectPolicyError(
      () => decodeRpcs3Policy({ extra: { args: ["ok", 3] } }),
      `${KORRI_RPCS3_PLUGIN_ID} policy extra.args must be a string array`,
    )
  })
})

function expectPolicyError(run: () => unknown, reason: string): void {
  try {
    run()
    throw new Error("expected policy decode to fail")
  } catch (error) {
    expect(error).toBeInstanceOf(AppMaterializationFailed)
    expect((error as AppMaterializationFailed).reason).toBe(reason)
  }
}
