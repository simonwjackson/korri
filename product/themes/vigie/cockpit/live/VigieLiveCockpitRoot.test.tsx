import { describe, expect, it } from "bun:test"
import type { KorriPlatformBridge } from "@platform/theme/bridge"
import { fetchVigieLiveSnapshot } from "./VigieLiveCockpitRoot"

describe("Vigie live cockpit root", () => {
  it("fetches provider diagnostics through the generic plugin RPC", async () => {
    const calls: { readonly method: string; readonly payload: unknown }[] = []
    const bridge = bridgeWithRpc(async (method, payload) => {
      calls.push({ method, payload })
      if (method === "app.plugin.diagnostics.collect") {
        return {
          providerId: "@korri:steam",
          diagnostics: { observer: { state: "running" }, recentEvidence: [] },
        }
      }
      return responseFor(method)
    })

    const snapshot = await fetchVigieLiveSnapshot(bridge)

    expect(calls).toContainEqual({
      method: "app.plugin.diagnostics.collect",
      payload: { providerId: "@korri:steam" },
    })
    expect(calls.map(call => call.method)).not.toContain("app.steam.status")
    expect(snapshot.providerDiagnostics).toEqual([
      {
        providerId: "@korri:steam",
        diagnostics: { observer: { state: "running" }, recentEvidence: [] },
      },
    ])
  })
})

function bridgeWithRpc(
  rpc: KorriPlatformBridge["api"]["rpc"],
): KorriPlatformBridge {
  return {
    library: {
      list: async () => [],
      launch: async () => {},
    },
    input: {
      subscribe: () => () => {},
    },
    foregroundSession: {
      get: async () => ({ _tag: "Ready" }),
    },
    api: { rpc },
  }
}

function responseFor(method: string): unknown {
  switch (method) {
    case "app.server.status":
      return {
        serverId: "bandai",
        displayName: "Bandai",
        capabilities: [],
        status: "available",
      }
    case "app.session.status":
      return { _tag: "SessionStatus", mode: "home" }
    case "app.source.status":
      return { status: "available" }
    case "app.catalog.snapshot":
      return {
        peers: [],
        entries: [],
        health: { failedPeers: 0, self: "ready", readyPeers: 0 },
        generation: 1,
      }
    case "app.stream-control.config.get":
      return {}
    case "app.stream-control.controls.get":
      return { controls: [] }
    case "app.stream-control.state.get":
      return {
        moonlight: { status: "disabled" },
        brightness: { status: "disabled" },
        battery: { status: "disabled" },
        plugins: {},
      }
    default:
      throw new Error(`unexpected RPC method ${method}`)
  }
}
