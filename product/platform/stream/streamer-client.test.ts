import { describe, expect, it } from "bun:test"
import { createPluginRegistry } from "@platform/plugin/registry"
import { moonlightPlugin } from "@product/plugins/moonlight"
import { dispatchStreamLaunch, resolveStreamLauncher } from "./streamer-client"

const withMoonlight = createPluginRegistry([moonlightPlugin], {
  enabledPluginIds: [moonlightPlugin.id],
})
const empty = createPluginRegistry([], {})

describe("streamer-client", () => {
  it("resolves the enabled streamer plugin and its stream.launch handler", () => {
    const resolved = resolveStreamLauncher(withMoonlight)
    expect(resolved?.provider).toBe(moonlightPlugin.id)
    expect(resolved?.handler.operation).toBe("stream.launch")
  })

  it("returns undefined when no enabled plugin provides the streamer", () => {
    expect(resolveStreamLauncher(empty)).toBeUndefined()
  })

  it("dispatches a stream launch and returns the composed LaunchSpec", async () => {
    const spec = await dispatchStreamLaunch(withMoonlight, {
      facts: { host: "10.0.0.5", inputDevices: ["/dev/input/event10"] },
      policy: { stream: { fps: 60 } },
    })

    expect(spec.command).toBe("moonlight")
    expect(spec.args).toEqual([
      "stream",
      "-fps",
      "60",
      "-input",
      "/dev/input/event10",
      "-app",
      "Korri Stream",
      "10.0.0.5",
    ])
  })

  it("fails closed when no streamer capability is available", async () => {
    await expect(
      dispatchStreamLaunch(empty, { facts: { host: "10.0.0.5" } }),
    ).rejects.toThrow(/streamer capability/)
  })
})
