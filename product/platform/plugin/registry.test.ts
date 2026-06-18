import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import { plugin, runPluginHandler } from "."
import {
  createPluginRegistry,
  DuplicatePluginId,
  executableResources,
  parseEnabledPluginIds,
} from "./registry"

const alpha = plugin({
  namespace: "@korri",
  name: "alpha",
  title: "Alpha",
  contributes: {
    config: {
      catalog: {
        one: { id: "one", title: "One", kind: "game", releases: [] },
      },
    },
  },
})

const beta = plugin({ namespace: "@korri", name: "beta", title: "Beta" })

const wrapper = plugin({
  namespace: "@fake",
  name: "wrapper",
  title: "Wrapper",
  contributes: {
    config: {
      modules: {
        wrapper: {
          id: "wrapper",
          kind: "launch-wrapper",
          supports: { systems: ["*"] },
        },
      },
    },
    handlers: [
      {
        id: "wrapper.compose",
        operation: "launch.compose",
        capabilities: ["launch.wrapper"],
        run: context => ({ provider: context.provider, input: context.input }),
      },
    ],
  },
})

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
    expect(Object.keys(registry.providers)).toEqual(["@korri:alpha"])
    expect(Object.keys(registry.catalog)).toEqual(["@korri:alpha/one"])
  })

  it("rejects duplicate plugin ids", () => {
    expect(() => createPluginRegistry([alpha, alpha])).toThrow(
      DuplicatePluginId,
    )
  })

  it("exposes enabled handler and generic config contributions", () => {
    const registry = createPluginRegistry([wrapper], {
      enabledPluginIds: ["@fake:wrapper"],
    })

    expect(registry.modules["@fake:wrapper/wrapper"]).toEqual({
      id: "wrapper",
      kind: "launch-wrapper",
      supports: { systems: ["*"] },
    })
    expect(registry.handlers.map(handler => handler.id)).toEqual([
      "wrapper.compose",
    ])
  })

  it("enables explicit plugin requirements as dependency closure", () => {
    const runtime = plugin({
      namespace: "@korri",
      name: "runtime",
      contributes: {
        config: {
          runtimes: {
            default: { id: "default", kind: "test-runtime" },
          },
        },
      },
    })
    const game = plugin({
      namespace: "@korri",
      name: "game",
      requires: [
        {
          capability: "runtime.resolve",
          ref: { provider: runtime.id, id: "default" },
        },
      ],
    })

    const registry = createPluginRegistry([runtime, game], {
      enabledPluginIds: [game.id],
    })

    expect(registry.enabledPluginIds.has(game.id)).toBe(true)
    expect(registry.enabledPluginIds.has(runtime.id)).toBe(true)
    expect(registry.runtimes[`${runtime.id}/default`]).toEqual({
      id: "default",
      kind: "test-runtime",
    })
  })

  it("projects executable resources from generic module config records", () => {
    const resources = executableResources(
      createPluginRegistry(
        [
          plugin({
            namespace: "@korri",
            name: "native",
            contributes: {
              config: {
                modules: {
                  app: {
                    id: "app",
                    kind: "executable",
                    fulfill: {
                      provider: "nix",
                      installable: "nixpkgs#app",
                      binary: "app",
                    },
                  },
                },
              },
            },
          }),
        ],
        { enabledPluginIds: ["@korri:native"] },
      ),
    )

    expect(resources).toHaveLength(1)
    expect(resources[0]?.recordId).toBe("@korri:native/app")
    expect(resources[0]?.resource.fulfill.binary).toBe("app")
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
          { operation: "test", provider: "@korri:alpha" },
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
          { operation: "test", provider: "@korri:alpha" },
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
          { operation: "test", provider: "@korri:alpha" },
        ),
      ),
    ).resolves.toBe("effect")
  })
})
