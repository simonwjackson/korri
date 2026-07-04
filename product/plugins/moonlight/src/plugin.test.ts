import { describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import { composeMoonlightStreamLaunchSpec } from "./moonlight-launch-spec"
import { KORRI_MOONLIGHT_PLUGIN_ID, moonlightPlugin } from "./plugin"

describe("Moonlight plugin descriptor", () => {
  it("has a stable id and streamer capability contributions", () => {
    expect(moonlightPlugin.id).toBe(KORRI_MOONLIGHT_PLUGIN_ID)
    expect(
      moonlightPlugin.contributes.config.modules?.["stream-launch"],
    ).toMatchObject({ kind: "streamer", capabilities: ["stream.launch"] })
    expect(
      moonlightPlugin.contributes.config.modules?.["stream-control"],
    ).toMatchObject({
      kind: "control-surface",
      capabilities: [
        "stream-control.apply",
        "stream-control.describe",
        "stream-control.connect",
      ],
    })
    expect(
      moonlightPlugin.contributes.config.modules?.[
        "moonlight-embedded-korri-package"
      ],
    ).toMatchObject({
      kind: "nix-package",
      package: "moonlight-embedded-korri",
      path: "product/plugins/moonlight/packages/moonlight-embedded-korri",
    })
  })

  it("exposes the expected operation handlers", () => {
    expect(
      moonlightPlugin.contributes.handlers?.map(handler => handler.operation),
    ).toEqual([
      "stream.launch",
      "stream-control.describe",
      "stream-control.apply",
      "stream-control.connect",
      "diagnostics.collect",
    ])
  })

  it("stream.launch composes the same LaunchSpec as calling directly", async () => {
    const launch = moonlightPlugin.contributes.handlers?.find(
      handler => handler.operation === "stream.launch",
    )
    if (!launch) throw new Error("missing stream.launch handler")

    const input = {
      facts: { host: "10.0.0.5", inputDevices: ["/dev/input/event10"] },
      policy: { stream: { fps: 60, bitrateKbps: 12_000 } },
    }

    await expect(
      Effect.runPromise(
        runPluginHandler(launch, {
          operation: "stream.launch",
          provider: KORRI_MOONLIGHT_PLUGIN_ID,
          input,
        }),
      ),
    ).resolves.toEqual(composeMoonlightStreamLaunchSpec(input))
  })

  it("stream.launch rejects malformed input", async () => {
    const launch = moonlightPlugin.contributes.handlers?.find(
      handler => handler.operation === "stream.launch",
    )
    if (!launch) throw new Error("missing stream.launch handler")

    await expect(
      Effect.runPromise(
        runPluginHandler(launch, {
          operation: "stream.launch",
          provider: KORRI_MOONLIGHT_PLUGIN_ID,
          input: { facts: { host: 123 } },
        }),
      ),
    ).rejects.toThrow(/string host/)
  })
})
