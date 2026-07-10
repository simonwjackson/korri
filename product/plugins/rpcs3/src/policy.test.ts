import { describe, expect, it } from "bun:test"
import { AppMaterializationFailed } from "@platform/library/config/errors"
import { decodeRpcs3Policy } from "./policy"

describe("decodeRpcs3Policy", () => {
  it("decodes a full Phase 0+1 unified settings tree", () => {
    expect(
      decodeRpcs3Policy({
        state: { root: "{storage:@korri:rpcs3/state}" },
        firmware: { sentinel: "dev_flash/sys/external/liblv2.sprx" },
        video: {
          resolution: "1280x720",
          aspectRatio: "16:9",
          fullscreen: true,
          frameLimit: 60,
          vsync: true,
        },
        audio: { volume: 80, device: "@system" },
        boot: {
          headless: true,
          exitOnFinish: true,
          suppressPopups: true,
          autoStart: true,
        },
      }),
    ).toEqual({
      state: { root: "{storage:@korri:rpcs3/state}" },
      firmware: { sentinel: "dev_flash/sys/external/liblv2.sprx" },
      video: {
        resolution: "1280x720",
        aspectRatio: "16:9",
        fullscreen: true,
        frameLimit: 60,
        vsync: true,
      },
      audio: { volume: 80, device: "@system" },
      boot: {
        headless: true,
        exitOnFinish: true,
        suppressPopups: true,
        autoStart: true,
      },
    })
  })

  it("decodes named frame-limit modes", () => {
    expect(decodeRpcs3Policy({ video: { frameLimit: "auto" } })).toEqual({
      video: { frameLimit: "auto" },
    })
  })

  it("decodes derived input-seat defaults", () => {
    expect(
      decodeRpcs3Policy({
        input: {
          derivedSeatDefaults: {
            sticks: { right: { multiplier: 125 } },
          },
        },
      }),
    ).toEqual({
      input: {
        derivedSeatDefaults: {
          sticks: { right: { multiplier: 125 } },
        },
      },
    })
  })

  it("decodes the Phase 2 power-user tranche", () => {
    expect(
      decodeRpcs3Policy({
        video: {
          renderer: "vulkan",
          resolutionScale: 150,
          anisotropicFilter: 16,
          shaderMode: "async",
        },
        audio: { backend: "faudio", format: "surround-5.1" },
        system: { language: "en-US", licenseArea: "america" },
      }),
    ).toEqual({
      video: {
        renderer: "vulkan",
        resolutionScale: 150,
        anisotropicFilter: 16,
        shaderMode: "async",
      },
      audio: { backend: "faudio", format: "surround-5.1" },
      system: { language: "en-US", licenseArea: "america" },
    })
  })

  it("rejects invalid Phase 2 enums and out-of-range ints", () => {
    expectPolicyError(() => decodeRpcs3Policy({ video: { renderer: "metal" } }))
    expectPolicyError(() =>
      decodeRpcs3Policy({ video: { resolutionScale: 5 } }),
    )
    expectPolicyError(() =>
      decodeRpcs3Policy({ audio: { backend: "pulseaudio" } }),
    )
    expectPolicyError(() =>
      decodeRpcs3Policy({ system: { language: "en-AU" } }),
    )
  })

  it("decodes the Phase 3 per-game accuracy tranche", () => {
    expect(
      decodeRpcs3Policy({
        core: {
          ppuDecoder: "llvm-recompiler",
          spuDecoder: "asmjit-recompiler",
          spuBlockSize: "mega",
          spuXFloatAccuracy: "approximate",
          preferredSpuThreads: 2,
          clocksScale: 150,
          librariesControl: ["libfoo.sprx:lle", "libbar.sprx:hle"],
        },
        video: {
          writeColorBuffers: true,
          writeDepthBuffer: false,
          readColorBuffers: true,
          strictRendering: true,
          disableZcull: false,
          msaa: "disabled",
        },
      }),
    ).toEqual({
      core: {
        ppuDecoder: "llvm-recompiler",
        spuDecoder: "asmjit-recompiler",
        spuBlockSize: "mega",
        spuXFloatAccuracy: "approximate",
        preferredSpuThreads: 2,
        clocksScale: 150,
        librariesControl: ["libfoo.sprx:lle", "libbar.sprx:hle"],
      },
      video: {
        writeColorBuffers: true,
        writeDepthBuffer: false,
        readColorBuffers: true,
        strictRendering: true,
        disableZcull: false,
        msaa: "disabled",
      },
    })
  })

  it("accepts boundary and empty Phase 3 values", () => {
    expect(
      decodeRpcs3Policy({ core: { preferredSpuThreads: 0, clocksScale: 10 } }),
    ).toEqual({ core: { preferredSpuThreads: 0, clocksScale: 10 } })
    expect(decodeRpcs3Policy({ core: { librariesControl: [] } })).toEqual({
      core: { librariesControl: [] },
    })
  })

  it("rejects invalid Phase 3 enums, out-of-range ints, and excess keys", () => {
    expectPolicyError(() => decodeRpcs3Policy({ core: { ppuDecoder: "fast" } }))
    // The legacy dynamic SPU interpreter is intentionally not surfaced.
    expectPolicyError(() =>
      decodeRpcs3Policy({ core: { spuDecoder: "interpreter-dynamic" } }),
    )
    expectPolicyError(() =>
      decodeRpcs3Policy({ core: { preferredSpuThreads: 7 } }),
    )
    expectPolicyError(() => decodeRpcs3Policy({ core: { clocksScale: 5 } }))
    expectPolicyError(() => decodeRpcs3Policy({ video: { msaa: "4x" } }))
    expectPolicyError(
      () => decodeRpcs3Policy({ core: { bogus: true } }),
      "bogus",
    )
  })

  it("decodes partial trees and an empty policy", () => {
    expect(decodeRpcs3Policy({ video: { fullscreen: false } })).toEqual({
      video: { fullscreen: false },
    })
    expect(decodeRpcs3Policy({ boot: { headless: true } })).toEqual({
      boot: { headless: true },
    })
    expect(decodeRpcs3Policy(undefined)).toEqual({})
    expect(decodeRpcs3Policy({})).toEqual({})
  })

  it("rejects retired launcher-plumbing keys (command/env/extra)", () => {
    // These moved off the authoring surface: command -> app record,
    // env -> context.env, extra -> overrides escape hatch.
    expectPolicyError(() =>
      decodeRpcs3Policy({ command: "/run/current-system/sw/bin/rpcs3" }),
    )
    expectPolicyError(() =>
      decodeRpcs3Policy({ env: { WAYLAND_DISPLAY: "wayland-1" } }),
    )
    expectPolicyError(() => decodeRpcs3Policy({ extra: { args: ["--x"] } }))
  })

  it("rejects an unknown curated key naming the offending path", () => {
    expectPolicyError(
      () => decodeRpcs3Policy({ video: { reslution: "1280x720" } }),
      "reslution",
    )
  })

  it("rejects an invalid enum literal", () => {
    expectPolicyError(() =>
      decodeRpcs3Policy({ video: { aspectRatio: "17:9" } }),
    )
  })

  it("rejects an empty state.root", () => {
    expectPolicyError(() => decodeRpcs3Policy({ state: { root: "" } }))
  })
})

function expectPolicyError(run: () => unknown, needle?: string): void {
  try {
    run()
    throw new Error("expected policy decode to fail")
  } catch (error) {
    expect(error).toBeInstanceOf(AppMaterializationFailed)
    if (needle !== undefined) {
      expect((error as AppMaterializationFailed).reason).toContain(needle)
    }
  }
}
