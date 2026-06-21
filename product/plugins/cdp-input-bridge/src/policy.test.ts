import { describe, expect, it } from "bun:test"
import {
  CDP_INPUT_BRIDGE_PLUGIN_ID,
  decodeCdpInputBridgePolicy,
  policyAnnotationFromMetadata,
} from "./policy"

describe("CDP input bridge policy", () => {
  it("decodes an enabled yfs-default annotation with safe defaults", () => {
    const policy = decodeCdpInputBridgePolicy({
      enable: true,
      cdpPort: 9333,
      mapping: "yfs-default",
    })

    expect(policy).toMatchObject({
      enabled: true,
      cdpHost: "127.0.0.1",
      cdpPort: 9333,
      mappingName: "yfs-default",
      axis: { pressThreshold: 12000, releaseThreshold: 8000 },
      attachTimeoutMs: 5000,
      failClosed: true,
    })
  })

  it("treats absent or disabled annotations as disabled", () => {
    expect(decodeCdpInputBridgePolicy(undefined)).toEqual({ enabled: false })
    expect(decodeCdpInputBridgePolicy({ enable: false })).toEqual({ enabled: false })
  })

  it("decodes source preference and target selector", () => {
    const policy = decodeCdpInputBridgePolicy({
      enable: true,
      sourcePreference: { names: ["Microsoft Xbox Series S|X Controller"] },
      target: { urlPattern: "YoshisFabricationStation/index.html", type: "page" },
    })

    expect(policy).toMatchObject({
      enabled: true,
      sourcePreference: { names: ["Microsoft Xbox Series S|X Controller"] },
      target: { urlPattern: "YoshisFabricationStation/index.html", type: "page" },
    })
  })

  it("rejects malformed policy instead of falling back to unsafe defaults", () => {
    expect(() => decodeCdpInputBridgePolicy({ enable: true, cdpPort: 0 })).toThrow()
    expect(() => decodeCdpInputBridgePolicy({ enable: true, extra: true })).toThrow()
    expect(() => decodeCdpInputBridgePolicy({ enable: true, mapping: "unknown" })).toThrow(/Unknown CDP input bridge mapping/)
  })

  it("extracts only the provider-owned annotation from launch metadata", () => {
    const annotation = { enable: true, mapping: "yfs-default" }

    expect(
      policyAnnotationFromMetadata({
        annotations: { [CDP_INPUT_BRIDGE_PLUGIN_ID]: annotation, "@korri:other": { enable: true } },
      }),
    ).toBe(annotation)
  })
})
