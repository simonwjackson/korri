import { describe, expect, it } from "bun:test"

const settingsSource = await Bun.file(
  "product/plugins/yoshis-fabrication-station/scripts/yfs-launch-settings.js",
)
  .text()
  .catch(() => "")
const loaderSource = await Bun.file(
  "product/plugins/yoshis-fabrication-station/scripts/yfs-level-loader.js",
)
  .text()
  .catch(() => "")

describe("YFS browser shims", () => {
  it("provides launch settings without preserveDrawingBuffer", () => {
    expect(settingsSource).toContain("__YFS_LAUNCH_SETTINGS")
    expect(settingsSource).toContain("__YFSGetSetting")
    expect(settingsSource).not.toContain("preserveDrawingBuffer")
    expect(settingsSource).not.toContain(
      "HTMLCanvasElement.prototype.getContext",
    )
  })

  it("uses single-purpose code_url loading and reports gameplay timeout as failure", () => {
    expect(loaderSource).toContain('params.has("code_url")')
    expect(loaderSource).not.toContain('params.has("sample")')
    expect(loaderSource).not.toContain('params.has("code_b64")')
    expect(loaderSource).toContain('state.status = "failed"')
    expect(loaderSource).toContain("Gameplay did not replace the load UI")
  })
})
