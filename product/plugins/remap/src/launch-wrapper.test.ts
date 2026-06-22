import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@platform/library/launcher"
import {
  KORRI_REMAP_RUNNER_USER,
  buildRemapWrapperLaunchSpec,
  remapWrapperEnv,
} from "./launch-wrapper"
import { decodeRemapPolicy, normalizeRemapPolicy } from "./policy"

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
  it("wraps a child launch with argv-carried Remap policy", () => {
    expect(
      buildRemapWrapperLaunchSpec({
        child,
        policy,
        wrapperCommand: "korri-remap-bridge",
        launchId: "launch-1",
      }),
    ).toEqual({
      command: "korri-remap-bridge",
      args: [
        "--launch-id",
        "launch-1",
        "--policy-json",
        JSON.stringify(policy),
        "--runner-user",
        KORRI_REMAP_RUNNER_USER,
        "--",
        "/games/yfs/run",
        "--fullscreen",
      ],
      cwd: "/games/yfs",
      env: { DISPLAY: ":0" },
      envUnset: ["HTTP_PROXY"],
    })
  })

  it("keeps wrapper-owned control data out of env for setuid wrappers", () => {
    expect(remapWrapperEnv({ child })).toEqual({ DISPLAY: ":0" })
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
    })

    expect(wrapperEnv).toEqual({ DISPLAY: ":0" })
  })
})
