import { describe, expect, it } from "bun:test"
import { KORRI_RYUBING_PLUGIN_ID, ryubingPlugin } from "./plugin"

describe("Ryubing plugin descriptor", () => {
  it("owns the Korri Ryubing runtime package metadata", () => {
    expect(ryubingPlugin.id).toBe(KORRI_RYUBING_PLUGIN_ID)
    expect(
      ryubingPlugin.contributes.config.modules?.["ryubing-korri-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "ryubing-korri",
      path: "product/plugins/ryubing/packages/ryubing-korri",
      capabilities: ["package.expose", "launch.runtime"],
      binaries: ["Ryujinx"],
    })
  })
})
