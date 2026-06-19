import { describe, expect, it } from "bun:test"
import {
  PluginInstallController,
  PluginInstallControllerLayerRpc,
} from "./plugin-install-rpc-layer"

describe("PluginInstallControllerLayerRpc", () => {
  it("exports the renderer install controller layer", () => {
    expect(PluginInstallController.key).toContain("PluginInstallController")
    expect(PluginInstallControllerLayerRpc).toBeDefined()
  })
})
