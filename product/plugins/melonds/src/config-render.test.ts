import { describe, expect, it } from "bun:test"
import { join } from "node:path"
import { renderMelonDsConfig } from "./config-render"

describe("melonDS config rendering", () => {
  it("renders default direct-boot vertical screen config with managed paths", () => {
    const stateRoot = "/var/lib/korri/melonDS"
    expect(
      renderMelonDsConfig({
        stateRoot,
        policy: {},
      }),
    ).toBe(
      [
        "[Emu]",
        "DirectBoot = true",
        "",
        "[Instance0]",
        `SaveFilePath = ${JSON.stringify(join(stateRoot, "saves"))}`,
        `SavestatePath = ${JSON.stringify(join(stateRoot, "savestates"))}`,
        `CheatFilePath = ${JSON.stringify(join(stateRoot, "cheats"))}`,
        "",
        "[Instance0.Window0]",
        "Enabled = true",
        "ScreenLayout = 1",
        "ScreenSizing = 0",
        "ScreenGap = 0",
        "ScreenSwap = false",
        "IntegerScaling = false",
        "",
        "[Instance0.Window1]",
        "Enabled = false",
        "",
      ].join("\n"),
    )
  })

  it("renders single-window display variants", () => {
    expect(windowLines({ display: { mode: "horizontal" } })).toContain(
      "ScreenLayout = 2",
    )
    expect(windowLines({ display: { mode: "hybrid" } })).toContain(
      "ScreenLayout = 3",
    )
    expect(windowLines({ display: { mode: "hybrid" } })).toContain(
      "ScreenSizing = 1",
    )
    expect(windowLines({ display: { mode: "top-only" } })).toContain(
      "ScreenSizing = 4",
    )
    expect(windowLines({ display: { mode: "bottom-only" } })).toContain(
      "ScreenSizing = 5",
    )
  })

  it("renders dual-window top and bottom screen sections", () => {
    const config = renderMelonDsConfig({
      stateRoot: "/tmp/melonDS",
      policy: { display: { mode: "dual-window", gap: 12 } },
    })

    expect(config).toContain("[Instance0.Window0]\nEnabled = true")
    expect(config).toContain("ScreenSizing = 4")
    expect(config).toContain("[Instance0.Window1]\nEnabled = true")
    expect(config).toContain("ScreenSizing = 5")
    expect(config).toContain("ScreenGap = 12")
  })

  it("renders renderer values only when authored", () => {
    expect(windowLines({ video: { renderer: "software" } })).toContain(
      "[3D]\nRenderer = 0",
    )
    expect(windowLines({ video: { renderer: "opengl" } })).toContain(
      "[3D]\nRenderer = 1",
    )
    expect(
      windowLines({ video: { renderer: "opengl-compute", scaleFactor: 4 } }),
    ).toContain("Renderer = 2\nGL.ScaleFactor = 4")
  })
})

function windowLines(
  policy: Parameters<typeof renderMelonDsConfig>[0]["policy"],
) {
  return renderMelonDsConfig({
    stateRoot: "/tmp/melonDS",
    policy,
  })
}
