import { describe, expect, it } from "bun:test"
import {
  KORRI_RYUBING_APP_ID,
  KORRI_RYUBING_DISCOVERY_PROVIDER_ID,
  KORRI_RYUBING_PLUGIN_ID,
  KORRI_RYUBING_STATE_STORAGE_ID,
  KORRI_RYUBING_SYSTEM_ID,
  ryubingPlugin,
} from "./plugin"

describe("Ryubing plugin descriptor", () => {
  it("owns the Korri Ryubing runtime package metadata", () => {
    expect(ryubingPlugin.id).toBe(KORRI_RYUBING_PLUGIN_ID)
    expect(ryubingPlugin.contributes.config.storage?.state).toMatchObject({
      id: KORRI_RYUBING_STATE_STORAGE_ID,
      root: "/var/lib/korri/ryubing",
    })
    expect(ryubingPlugin.contributes.config.launchers?.ryubing).toMatchObject({
      id: KORRI_RYUBING_APP_ID,
      plugin: KORRI_RYUBING_PLUGIN_ID,
      command: "Ryujinx",
      systems: [KORRI_RYUBING_SYSTEM_ID],
      settings: {
        plugin: {
          state: { root: `{storage:${KORRI_RYUBING_STATE_STORAGE_ID}}` },
        },
      },
    })
    expect(ryubingPlugin.contributes.config.systems?.switch).toMatchObject({
      id: KORRI_RYUBING_SYSTEM_ID,
      title: "Nintendo Switch",
    })
    expect(
      ryubingPlugin.contributes.config.modules?.["ryubing-korri-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "ryubing-korri",
      path: "product/plugins/ryubing/packages/ryubing-korri",
      capabilities: ["package.expose", "launch.runtime"],
      binaries: ["Ryujinx"],
    })
    expect(
      ryubingPlugin.contributes.discovery?.map(provider => provider.id),
    ).toEqual([KORRI_RYUBING_DISCOVERY_PROVIDER_ID])
  })
})
