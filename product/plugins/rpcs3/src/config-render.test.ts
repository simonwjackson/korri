import { describe, expect, it } from "bun:test"
import { parse } from "yaml"
import { renderConfigYaml } from "./config-render"

describe("renderConfigYaml", () => {
  it("returns undefined when there is nothing to write", () => {
    expect(renderConfigYaml({ entries: [] })).toBeUndefined()
    expect(
      renderConfigYaml({ entries: [], overridesConfig: {} }),
    ).toBeUndefined()
  })

  it("renders routed entries as nested config sections", () => {
    const text = renderConfigYaml({
      entries: [
        ["Video.Resolution", "1280x720"],
        ["Video.VSync Mode", "Disabled"],
        ["Audio.Master Volume", 80],
        ["Miscellaneous.Start games in fullscreen mode", false],
      ],
    })
    expect(text).toBeDefined()
    expect(parse(text as string)).toEqual({
      Video: { Resolution: "1280x720", "VSync Mode": "Disabled" },
      Audio: { "Master Volume": 80 },
      Miscellaneous: { "Start games in fullscreen mode": false },
    })
  })

  it("read-merges the operator canonical config with routed settings winning", () => {
    const canonical =
      "Video:\n  Resolution: 1920x1080\n  Renderer: Vulkan\nAudio:\n  Master Volume: 100\n"
    const text = renderConfigYaml({
      canonical,
      entries: [["Video.Resolution", "1280x720"]],
    })
    expect(parse(text as string)).toEqual({
      Video: { Resolution: "1280x720", Renderer: "Vulkan" },
      Audio: { "Master Volume": 100 },
    })
  })

  it("deep-merges overrides.config.append over routed settings", () => {
    const text = renderConfigYaml({
      entries: [["Video.Resolution", "1280x720"]],
      overridesConfig: {
        append: "Video:\n  Resolution: 1920x1080\n  Anisotropic Filter Override: 16\n",
      },
    })
    expect(parse(text as string)).toEqual({
      Video: { Resolution: "1920x1080", "Anisotropic Filter Override": 16 },
    })
  })

  it("orders precedence canonical < routed < prepend < append", () => {
    const text = renderConfigYaml({
      canonical: "Video:\n  Frame limit: Auto\n",
      entries: [["Video.Frame limit", "60"]],
      overridesConfig: {
        prepend: "Video:\n  Frame limit: '30'\n",
        append: "Video:\n  Frame limit: '50'\n",
      },
    })
    expect(parse(text as string)).toEqual({ Video: { "Frame limit": "50" } })
  })

  it("lets overrides.config.replace win the whole file verbatim", () => {
    const replace = "Core:\n  PPU Decoder: Recompiler (LLVM)\n"
    const text = renderConfigYaml({
      entries: [["Video.Resolution", "1280x720"]],
      overridesConfig: { replace },
    })
    expect(text).toBe(replace)
  })
})
