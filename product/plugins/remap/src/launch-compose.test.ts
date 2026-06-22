import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@platform/library/launcher"
import { composeLaunchCompanions } from "@platform/plugin/launch-companion"
import { createPluginRegistry } from "@platform/plugin/registry"
import { Effect } from "effect"
import { remapPlugin } from ".."
import { KORRI_REMAP_PLUGIN_ID } from "./policy"

const spec: LaunchSpec = {
  command: "/games/yfs/run",
  args: ["--fullscreen"],
  env: { DISPLAY: ":0" },
}

const enabledRemapRegistry = () =>
  createPluginRegistry([remapPlugin], {
    enabledPluginIds: [KORRI_REMAP_PLUGIN_ID],
  })

describe("Remap launch.compose", () => {
  it("wraps the launch with korri-remap-bridge using an explicit launch id", async () => {
    const result = await Effect.runPromise(
      composeLaunchCompanions({
        spec,
        registry: enabledRemapRegistry(),
        launchCompanions: {
          [KORRI_REMAP_PLUGIN_ID]: {
            bindings: { "p1.button.west": "key.z" },
          },
        },
        options: { launchId: "launch-remap-1" },
      }),
    )

    expect(result).toEqual({
      _tag: "LaunchCompanionsComposed",
      spec: {
        command: "korri-remap-bridge",
        args: [
          "--launch-id",
          "launch-remap-1",
          "--",
          "/games/yfs/run",
          "--fullscreen",
        ],
        env: expect.objectContaining({
          DISPLAY: ":0",
          KORRI_REMAP_CHILD_COMMAND: "/games/yfs/run",
          KORRI_REMAP_LAUNCH_ID: "launch-remap-1",
          KORRI_REMAP_RUNNER_USER: "korri-remap-runner",
        }),
      },
    })
  })

  it("fails closed when no launch id is available", async () => {
    const result = await Effect.runPromise(
      composeLaunchCompanions({
        spec,
        registry: enabledRemapRegistry(),
        launchCompanions: {
          [KORRI_REMAP_PLUGIN_ID]: {
            bindings: { "p1.button.west": "key.z" },
          },
        },
      }),
    )

    expect(result).toMatchObject({
      _tag: "LaunchCompanionDiagnostics",
      diagnostics: [
        {
          _tag: "OperationFailed",
          provider: KORRI_REMAP_PLUGIN_ID,
          message: expect.stringContaining("launchId"),
        },
      ],
    })
  })
})
