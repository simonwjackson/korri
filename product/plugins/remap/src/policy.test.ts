import { describe, expect, it } from "bun:test"
import {
  KORRI_REMAP_PLUGIN_ID,
  decodeRemapPolicy,
  normalizeRemapPolicy,
  remapPolicyFromLaunch,
} from "./policy"

describe("Remap launch companion policy", () => {
  it("decodes a minimal binding map and defaults p1 to InputPlumber", () => {
    expect(
      normalizeRemapPolicy(
        decodeRemapPolicy({ bindings: { "p1.dpad.down": "key.down" } }),
      ),
    ).toEqual({
      enable: true,
      controllers: {
        p1: { source: "inputplumber-virtual-gamepad" },
      },
      bindings: [
        {
          source: {
            kind: "controller",
            player: "p1",
            control: { kind: "dpad", direction: "down" },
            ref: "p1.dpad.down",
          },
          targets: [{ kind: "keyboard", key: "arrow-down", ref: "key.down" }],
        },
      ],
    })
  })

  it("decodes explicit p1 and p2 controller preferences", () => {
    const policy = normalizeRemapPolicy(
      decodeRemapPolicy({
        controllers: {
          p1: {
            source: "inputplumber-virtual-gamepad",
            prefer: { name: "microsoft-xbox-series-s-x-controller" },
          },
          p2: {
            source: "inputplumber-virtual-gamepad",
            prefer: { name: "second-inputplumber-controller" },
          },
        },
        bindings: {
          "p1.button.south": "key.z",
          "p2.button.south": "p2.button.east",
        },
      }),
    )

    expect(policy.controllers).toEqual({
      p1: {
        source: "inputplumber-virtual-gamepad",
        prefer: { name: "microsoft-xbox-series-s-x-controller" },
      },
      p2: {
        source: "inputplumber-virtual-gamepad",
        prefer: { name: "second-inputplumber-controller" },
      },
    })
    expect(policy.bindings.map(binding => binding.source.ref)).toEqual([
      "p1.button.south",
      "p2.button.south",
    ])
  })

  it("preserves ordered multi-target bindings", () => {
    expect(
      normalizeRemapPolicy(
        decodeRemapPolicy({
          bindings: { "p1.button.west": ["key.z", "p1.button.south"] },
        }),
      ).bindings[0]?.targets.map(target => target.ref),
    ).toEqual(["key.z", "p1.button.south"])
  })

  it("extracts provider policy from launch.with", () => {
    const policy = { bindings: { "p1.dpad.up": "key.up" } }

    expect(
      remapPolicyFromLaunch({
        launch: { with: { [KORRI_REMAP_PLUGIN_ID]: policy } },
      }),
    ).toBe(policy)
  })

  it("rejects backend, profile, preset, CDP, and browser-shaped fields", () => {
    for (const key of [
      "cdp",
      "chrome",
      "chromium",
      "browser-target",
      "profile",
      "preset",
    ]) {
      expect(() =>
        decodeRemapPolicy({ bindings: { "p1.dpad.down": "key.down" }, [key]: true }),
      ).toThrow()
    }
  })

  it("rejects arbitrary controller ids and undefined explicit controllers", () => {
    expect(() =>
      decodeRemapPolicy({
        controllers: { "player-one": { source: "inputplumber-virtual-gamepad" } },
        bindings: { "p1.dpad.down": "key.down" },
      }),
    ).toThrow(/player slot/)
    expect(() =>
      decodeRemapPolicy({
        controllers: { p2: { source: "inputplumber-virtual-gamepad" } },
        bindings: { "p1.dpad.down": "key.down" },
      }),
    ).toThrow(/undefined controller/)
  })
})
