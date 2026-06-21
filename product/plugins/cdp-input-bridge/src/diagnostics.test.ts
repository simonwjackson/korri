import { describe, expect, it } from "bun:test"
import { collectCdpInputBridgeDiagnostics } from "./diagnostics"
import { CDP_INPUT_BRIDGE_PLUGIN_ID } from "./policy"

describe("CDP input bridge diagnostics", () => {
  it("reports command, policy decode, and source preference", () => {
    const result = collectCdpInputBridgeDiagnostics({
      command: "/nix/store/bridge/bin/korri-cdp-input-bridge",
      annotation: {
        enable: true,
        cdpPort: 9333,
        sourcePreference: { names: ["Microsoft Xbox Series S|X Controller"] },
      },
    })

    expect(result).toMatchObject({
      provider: CDP_INPUT_BRIDGE_PLUGIN_ID,
      command: {
        path: "/nix/store/bridge/bin/korri-cdp-input-bridge",
        configured: true,
      },
      policy: { status: "enabled", cdpPort: 9333, mapping: "yfs-default" },
      source: { names: ["Microsoft Xbox Series S|X Controller"] },
    })
  })

  it("surfaces malformed annotations without throwing", () => {
    const result = collectCdpInputBridgeDiagnostics({
      annotation: { enable: true, cdpPort: -1 },
    })

    expect(result.policy.status).toBe("invalid")
    if (result.policy.status !== "invalid")
      throw new Error("expected invalid policy")
    expect(result.policy.error).toContain("cdpPort")
  })
})
