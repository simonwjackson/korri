import { describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import {
  type Box64RuntimeResolveOutput,
  box64RuntimePlugin,
  KORRI_BOX64_RUNTIME_PLUGIN_ID,
} from ".."

describe("Box64 runtime plugin descriptor", () => {
  it("uses a stable first-party plugin identity", () => {
    expect(KORRI_BOX64_RUNTIME_PLUGIN_ID).toBe("@korri:box64-runtime")
    expect(box64RuntimePlugin.id).toBe(KORRI_BOX64_RUNTIME_PLUGIN_ID)
  })

  it("contributes runtime, package, launch wrapper, and handlers", () => {
    expect(
      box64RuntimePlugin.contributes.config.runtimes?.["linux-user"],
    ).toMatchObject({
      kind: "cpu-translation",
      host: "aarch64-linux",
      guest: "x86_64-linux",
      capabilities: ["runtime.resolve", "launch.compose"],
    })
    expect(
      box64RuntimePlugin.contributes.config.modules?.["runtime-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "korri-box64-runtime",
      capabilities: ["runtime.resolve", "launch.compose", "launch.wrapper"],
    })
    expect(
      box64RuntimePlugin.contributes.config.modules?.["launch-wrapper"],
    ).toMatchObject({
      kind: "launch-wrapper",
      capabilities: ["launch.compose", "launch.wrapper"],
    })
    expect(box64RuntimePlugin.handlers.map(handler => handler.operation)).toEqual([
      "runtime.resolve",
      "launch.compose",
      "diagnostics.collect",
    ])
  })

  it("resolves reusable Box64 runtime env from cwd", async () => {
    const handler = box64RuntimePlugin.handlers.find(
      candidate => candidate.operation === "runtime.resolve",
    )
    if (!handler) throw new Error("missing Box64 runtime.resolve handler")

    const result = (await Effect.runPromise(
      runPluginHandler(handler, {
        operation: "runtime.resolve",
        provider: KORRI_BOX64_RUNTIME_PLUGIN_ID,
        input: { cwd: "/games/3dsen" },
      }),
    )) as Box64RuntimeResolveOutput

    expect(result).toEqual({
      provider: KORRI_BOX64_RUNTIME_PLUGIN_ID,
      runtime: "linux-user",
      status: "resolved",
      env: {
        BOX64_PREFER_EMULATED: "0",
        BOX64_LD_LIBRARY_PATH:
          "/games/3dsen:/games/3dsen/lib:/games/3dsen/lib64:/games/3dsen/MonoBleedingEdge/x86_64",
      },
    })
  })

  it("wraps launches through the handler boundary", async () => {
    const handler = box64RuntimePlugin.handlers.find(
      candidate => candidate.operation === "launch.compose",
    )
    if (!handler) throw new Error("missing Box64 launch.compose handler")

    await expect(
      Effect.runPromise(
        runPluginHandler(handler, {
          operation: "launch.compose",
          provider: KORRI_BOX64_RUNTIME_PLUGIN_ID,
          input: {
            spec: { command: "./3dSen.exe", args: ["-id=37"], cwd: "/games/3dsen" },
            policy: { unityMode: true, maxCpu: 1, sdlVideoDriver: "x11" },
          },
        }),
      ),
    ).resolves.toMatchObject({
      command: "box64",
      args: ["./3dSen.exe", "-id=37"],
      cwd: "/games/3dsen",
      env: {
        BOX64_UNITY: "1",
        BOX64_MAXCPU: "1",
        SDL_VIDEODRIVER: "x11",
      },
    })
  })
})
