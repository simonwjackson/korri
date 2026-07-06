import { describe, expect, it } from "bun:test"

import { plugin } from "."
import type { PluginPolicy } from "./policy"
import {
  createPluginRegistry,
  enabledPluginIdsFromPolicy,
  pluginPolicyFromEnabledPluginEnv,
} from "./registry"

const runtime = plugin({
  namespace: "@test",
  name: "runtime",
  contributes: {
    handlers: [
      {
        id: "runtime.resolve",
        operation: "runtime.resolve",
        capabilities: ["runtime.resolve"],
        run: () => ({ ok: true }),
      },
    ],
  },
})

const game = plugin({
  namespace: "@test",
  name: "game",
  requires: [
    {
      capability: "runtime.resolve",
      ref: { provider: runtime.id, id: "self" },
    },
  ],
  contributes: {
    handlers: [
      {
        id: "game.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["diagnostics.collect"],
        run: () => ({ ok: true }),
      },
    ],
  },
})

describe("plugin policy", () => {
  it("drives registry enablement from provider-keyed policy", () => {
    const registry = createPluginRegistry([game, runtime], {
      pluginPolicy: { [game.id]: { enabled: true } },
    })

    expect(registry.enabledPluginIds.has(game.id)).toBe(true)
    expect(registry.enabledPluginIds.has(runtime.id)).toBe(true)
    expect(registry.policyDiagnostics).toEqual([])
  })

  it("keeps ungranted installed plugins inactive", () => {
    const registry = createPluginRegistry([game, runtime], { pluginPolicy: {} })

    expect(registry.pluginIds.has(game.id)).toBe(true)
    expect(registry.enabledPluginIds.has(game.id)).toBe(false)
    expect(registry.enabledPluginIds.has(runtime.id)).toBe(false)
  })

  it("reports policy grants for undiscovered plugins", () => {
    const result = enabledPluginIdsFromPolicy([game], {
      "@test:missing": { enabled: true },
    })

    expect(result.enabledPluginIds).toEqual([])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "missing-plugin",
        pluginId: "@test:missing",
      }),
    ])
  })

  it("reports requested capabilities that the plugin does not declare", () => {
    const policy: PluginPolicy = {
      [game.id]: {
        enabled: true,
        capabilities: ["network.fetch"],
      },
    }

    const result = enabledPluginIdsFromPolicy([game], policy)

    expect(result.enabledPluginIds).toEqual([game.id])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "denied-capability",
        pluginId: game.id,
        capability: "network.fetch",
      }),
    ])
  })

  it("translates KORRI_ENABLED_PLUGINS only through explicit test/dev compatibility", () => {
    expect(
      pluginPolicyFromEnabledPluginEnv("@test:game @test:runtime", {
        mode: "test-dev",
      }),
    ).toEqual({
      "@test:game": { enabled: true, source: "env-compat" },
      "@test:runtime": { enabled: true, source: "env-compat" },
    })

    expect(
      pluginPolicyFromEnabledPluginEnv("@test:game", { mode: "runtime" }),
    ).toEqual({})
  })
})
