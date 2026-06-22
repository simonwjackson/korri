import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@platform/library/launcher"
import { normalizeRemapPolicy, decodeRemapPolicy } from "./policy"
import {
  KORRI_REMAP_RUNNER_USER,
  buildRemapWrapperLaunchSpec,
  remapWrapperEnv,
} from "./launch-wrapper"

const child: LaunchSpec = {
  command: "/games/yfs/run",
  args: ["--fullscreen"],
  env: { DISPLAY: ":0" },
  envUnset: ["HTTP_PROXY"],
  cwd: "/games/yfs",
}

const policy = normalizeRemapPolicy(
  decodeRemapPolicy({ bindings: { "p1.button.west": "key.z" } }),
)

describe("Remap launch wrapper", () => {
  it("wraps a child launch with the stable Remap runner identity", () => {
    expect(
      buildRemapWrapperLaunchSpec({
        child,
        policy,
        wrapperCommand: "korri-remap-bridge",
        launchId: "launch-1",
      }),
    ).toEqual({
      command: "korri-remap-bridge",
      args: ["--launch-id", "launch-1", "--", "/games/yfs/run", "--fullscreen"],
      cwd: "/games/yfs",
      env: {
        DISPLAY: ":0",
        KORRI_REMAP_CHILD_COMMAND: "/games/yfs/run",
        KORRI_REMAP_LAUNCH_ID: "launch-1",
        KORRI_REMAP_POLICY_JSON: JSON.stringify(policy),
        KORRI_REMAP_RUNNER_USER,
      },
      envUnset: ["HTTP_PROXY"],
    })
  })

  it("keeps wrapper-owned env separate from child argv", () => {
    expect(remapWrapperEnv({ child, policy, launchId: "launch-2" })).toMatchObject({
      KORRI_REMAP_CHILD_COMMAND: "/games/yfs/run",
      KORRI_REMAP_LAUNCH_ID: "launch-2",
      KORRI_REMAP_RUNNER_USER,
    })
  })

  it("strips launch-controlled Remap env from wrapper env", () => {
    const wrapperEnv = remapWrapperEnv({
      child: {
        ...child,
        env: {
          DISPLAY: ":0",
          KORRI_REMAP_NATIVE_DRIVER: "enabled",
          KORRI_REMAP_POLICY_JSON: "attacker",
          KORRI_REMAP_RUNNER_USER: "korri",
        },
      },
      policy,
      launchId: "launch-3",
    })

    expect(wrapperEnv).toMatchObject({
      DISPLAY: ":0",
      KORRI_REMAP_CHILD_COMMAND: "/games/yfs/run",
      KORRI_REMAP_LAUNCH_ID: "launch-3",
      KORRI_REMAP_POLICY_JSON: JSON.stringify(policy),
      KORRI_REMAP_RUNNER_USER,
    })
    expect(wrapperEnv.KORRI_REMAP_NATIVE_DRIVER).toBeUndefined()
  })
})
