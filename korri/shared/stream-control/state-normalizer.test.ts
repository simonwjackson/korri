import { describe, expect, it } from "bun:test"
import {
  normalizeGamescopeState,
  normalizeMoonlightState,
} from "@shared/stream-control/state-normalizer"

describe("stream-control state normalizer", () => {
  it("prefers Moonlight runtime settings over stream quality fallbacks", () => {
    expect(
      normalizeMoonlightState({
        jsonrpc: "2.0",
        id: "state",
        result: {
          streamQuality: {
            bitrateKbps: 12_000,
            fps: 60,
            width: 1920,
            height: 1080,
          },
          runtimeSettings: {
            appliedBitrateKbps: 10_000,
            appliedFps: 45,
            appliedResolution: { width: 1280, height: 720 },
          },
        },
      }),
    ).toEqual({
      bitrateKbps: 10_000,
      fps: 45,
      resolution: { width: 1280, height: 720 },
    })
  })

  it("falls back to Moonlight stream quality when runtime settings are absent", () => {
    expect(
      normalizeMoonlightState({
        result: {
          streamQuality: {
            bitrateKbps: 12_000,
            fps: 60,
            width: 1920,
            height: 1080,
          },
        },
      }),
    ).toEqual({
      bitrateKbps: 12_000,
      fps: 60,
      resolution: { width: 1920, height: 1080 },
    })
  })

  it("normalizes GameScope state while dropping unknown filters", () => {
    expect(
      normalizeGamescopeState({
        result: {
          fps: 60,
          xwaylandMode: { width: 1280, height: 720 },
          sharpness: 8,
          filter: "fsr",
        },
      }),
    ).toEqual({
      fps: 60,
      resolution: { width: 1280, height: 720 },
      sharpness: 8,
      filter: "fsr",
    })

    expect(
      normalizeGamescopeState({ result: { filter: "future-filter" } }),
    ).toEqual({
      fps: null,
      resolution: null,
      sharpness: null,
      filter: null,
    })
  })
})
