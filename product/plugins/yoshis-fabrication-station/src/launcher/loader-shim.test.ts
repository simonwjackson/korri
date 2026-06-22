import { describe, expect, it } from "bun:test"

const settingsSource = await Bun.file(
  "product/plugins/yoshis-fabrication-station/scripts/yfs-launch-settings.js",
).text()
const loaderSource = await Bun.file(
  "product/plugins/yoshis-fabrication-station/scripts/yfs-level-loader.js",
).text()
const directLaunchSource = await Bun.file(
  "product/plugins/yoshis-fabrication-station/scripts/direct-launch.js",
).text()
const directLaunchPreSource = await Bun.file(
  "product/plugins/yoshis-fabrication-station/scripts/direct-launch-pre.js",
).text()
const patchC3MainSource = await Bun.file(
  "product/plugins/yoshis-fabrication-station/tools/patch-c3main.mjs",
).text()

describe("YFS browser shims", () => {
  it("provides launch settings without preserveDrawingBuffer", () => {
    expect(settingsSource).toContain("__YFS_LAUNCH_SETTINGS")
    expect(settingsSource).toContain("__YFSGetSetting")
    expect(settingsSource).not.toContain("preserveDrawingBuffer")
    expect(settingsSource).not.toContain(
      "HTMLCanvasElement.prototype.getContext",
    )
    expect(directLaunchPreSource).toContain("__YFSGetSetting")
    expect(directLaunchPreSource).not.toContain("preserveDrawingBuffer")
    expect(directLaunchPreSource).not.toContain(
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

  it("opens the YFS Play Level UI from in-page JavaScript", () => {
    expect(directLaunchSource).toContain("clickPlayLevelButton")
    expect(directLaunchSource).toContain("openPlayLevelUi")
    expect(directLaunchSource).toContain(
      'state.status = "opening-play-level-ui"',
    )
    expect(directLaunchSource).toContain(
      "Timed out opening the YFS Play Level UI",
    )
  })

  it("applies Construct engine zoom from owned runtime JavaScript", () => {
    expect(directLaunchSource).toContain("applyYfsLayoutScale")
    expect(directLaunchSource).toContain("c3_runtimeInterface")
    expect(directLaunchSource).toContain("GetILayout")
    expect(directLaunchSource).toContain('numericParam("zoom_scale")')
    expect(directLaunchSource).toContain("zoomApplied")
    expect(directLaunchSource).not.toContain("document.body.style.zoom")
  })

  it("does not expand generated Construct patches for viewport or zoom", () => {
    expect(patchC3MainSource).toContain("patch-c3main")
    expect(patchC3MainSource).toContain('"enableAudio"')
    expect(patchC3MainSource).not.toContain('"viewport"')
    expect(patchC3MainSource).not.toContain('"zoom"')
    expect(patchC3MainSource).not.toContain('"layoutScale"')
  })
})
