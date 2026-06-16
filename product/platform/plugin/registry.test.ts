import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import { plugin, runPluginHandler } from "."
import {
  createPluginRegistry,
  DuplicatePluginId,
  parseEnabledPluginIds,
} from "./registry"

const alpha = plugin({
  namespace: "@korri",
  name: "alpha",
  title: "Alpha",
  contributes: {
    catalog: [{ id: "one", title: "One", kind: "game", releases: [] }],
  },
})

const beta = plugin({ namespace: "@korri", name: "beta", title: "Beta" })

describe("createPluginRegistry", () => {
  it("keeps plugin identity independent from registration grouping", () => {
    const registry = createPluginRegistry([alpha, beta], {
      enabledPluginIds: ["@korri:alpha"],
    })

    expect(registry.pluginIds.has("@korri:alpha")).toBe(true)
    expect(registry.pluginIds.has("@korri:beta")).toBe(true)
    expect(registry.enabledPlugins.map(plugin => plugin.id)).toEqual([
      "@korri:alpha",
    ])
    expect(registry.catalog.map(entry => entry.item.id)).toEqual(["one"])
  })

  it("rejects duplicate plugin ids", () => {
    expect(() => createPluginRegistry([alpha, alpha])).toThrow(
      DuplicatePluginId,
    )
  })
})

describe("parseEnabledPluginIds", () => {
  it("preserves provider-style plugin ids while splitting lists", () => {
    expect(
      parseEnabledPluginIds("@korri:neverball,@korri:other pluginless"),
    ).toEqual(["@korri:neverball", "@korri:other"])
  })
})

describe("runPluginHandler", () => {
  it("normalizes plain, Promise-like, and Effect handler results", async () => {
    await expect(
      Effect.runPromise(
        runPluginHandler(
          { id: "plain", operation: "test", run: () => "plain" },
          { pluginId: "@korri:alpha" },
        ),
      ),
    ).resolves.toBe("plain")

    await expect(
      Effect.runPromise(
        runPluginHandler(
          {
            id: "promise",
            operation: "test",
            run: () => Promise.resolve("promise"),
          },
          { pluginId: "@korri:alpha" },
        ),
      ),
    ).resolves.toBe("promise")

    await expect(
      Effect.runPromise(
        runPluginHandler(
          {
            id: "effect",
            operation: "test",
            run: () => Effect.succeed("effect"),
          },
          { pluginId: "@korri:alpha" },
        ),
      ),
    ).resolves.toBe("effect")
  })
})
