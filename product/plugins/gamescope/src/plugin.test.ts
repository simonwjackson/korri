import { describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import { gamescopePlugin, KORRI_GAMESCOPE_PLUGIN_ID } from "./plugin"

describe("Gamescope plugin descriptor", () => {
  it("assembles Gamescope capabilities as generic config and operation handlers", async () => {
    expect(gamescopePlugin.id).toBe(KORRI_GAMESCOPE_PLUGIN_ID)
    expect(
      gamescopePlugin.contributes.config.modules?.["launch-wrapper"],
    ).toMatchObject({
      kind: "launch-wrapper",
      capabilities: ["launch.compose", "launch.wrapper"],
    })
    expect(
      gamescopePlugin.contributes.config.modules?.["gamescope-korri-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "gamescope-korri",
    })
    expect(gamescopePlugin.contributes.config.modules?.cli).toMatchObject({
      kind: "cli",
      binaries: ["korri-gamescope-control", "korri-gamescope-control-bridge"],
    })
    expect(
      gamescopePlugin.contributes.handlers?.map(handler => handler.operation),
    ).toEqual([
      "launch.compose",
      "stream-control.describe",
      "stream-control.apply",
      "session.cleanup",
      "package.expose",
      "cli.expose",
      "diagnostics.collect",
    ])

    const launchCompose = gamescopePlugin.contributes.handlers?.find(
      handler => handler.operation === "launch.compose",
    )
    if (!launchCompose) throw new Error("missing launch compose handler")

    await expect(
      Effect.runPromise(
        runPluginHandler(launchCompose, {
          operation: "launch.compose",
          provider: KORRI_GAMESCOPE_PLUGIN_ID,
          input: {
            spec: { command: "game", args: ["--run"] },
            policy: { command: "gamescope-korri", extraArgs: ["-f"] },
          },
        }),
      ),
    ).resolves.toEqual({
      command: "gamescope-korri",
      args: [
        "--backend",
        "wayland",
        "-f",
        "-b",
        "--expose-wayland",
        "-f",
        "--",
        "game",
        "--run",
      ],
      cwd: undefined,
    })
  })

  it("derives Steam-session flags from provider-qualified launch metadata", async () => {
    const launchCompose = gamescopePlugin.contributes.handlers?.find(
      handler => handler.operation === "launch.compose",
    )
    if (!launchCompose) throw new Error("missing launch compose handler")

    await expect(
      Effect.runPromise(
        runPluginHandler(launchCompose, {
          operation: "launch.compose",
          provider: KORRI_GAMESCOPE_PLUGIN_ID,
          input: {
            spec: {
              command: "/run/current-system/sw/bin/steam",
              args: ["-applaunch", "1332010"],
            },
            policy: { command: "gamescope-korri" },
            options: { launchMetadata: { appProviderId: "@korri:steam" } },
          },
        }),
      ),
    ).resolves.toMatchObject({
      command: "gamescope-korri",
      args: expect.arrayContaining(["-e"]),
    })
  })

  it("does not add Steam-session flags for non-Steam provider metadata", async () => {
    const launchCompose = gamescopePlugin.contributes.handlers?.find(
      handler => handler.operation === "launch.compose",
    )
    if (!launchCompose) throw new Error("missing launch compose handler")

    const result = await Effect.runPromise(
      runPluginHandler(launchCompose, {
        operation: "launch.compose",
        provider: KORRI_GAMESCOPE_PLUGIN_ID,
        input: {
          spec: { command: "/bin/game", args: [] },
          policy: { command: "gamescope-korri" },
          options: { launchMetadata: { appProviderId: "@korri:retroarch" } },
        },
      }),
    )

    expect((result as { readonly args: readonly string[] }).args).not.toContain(
      "-e",
    )
  })

  it("rejects malformed launch.compose input through the handler boundary", async () => {
    const launchCompose = gamescopePlugin.contributes.handlers?.find(
      handler => handler.operation === "launch.compose",
    )
    if (!launchCompose) throw new Error("missing launch compose handler")

    const exit = await Effect.runPromiseExit(
      runPluginHandler(launchCompose, {
        operation: "launch.compose",
        provider: KORRI_GAMESCOPE_PLUGIN_ID,
        input: { policy: {} },
      }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "input.spec must be a launch spec",
      )
    }
  })
})
