import { describe, expect, it } from "bun:test"
import {
  StreamControlSurface,
  FPS_STEPS,
  GAMESCOPE_FPS_STEPS,
  LINKED_FPS_STEPS,
  RESOLUTION_STEPS,
} from "@shared/stream-control/control-surface"

describe("StreamControlSurface", () => {
  it("derives unified known controls only from typed authoritative readbacks", () => {
    const surface = StreamControlSurface.fromState({
      moonlight: {
        status: "ok",
        readback: {
          bitrateKbps: 12_000,
          fps: 60,
          resolution: { width: 1920, height: 1080 },
        },
      },
      gamescope: {
        status: "ok",
        readback: {
          resolution: { width: 1920, height: 1080 },
          fps: 60,
          sharpness: 10,
          filter: "fsr",
        },
      },
      brightness: {
        status: "ok",
        readback: {
          percent: 50,
          devices: [
            {
              name: "panel-a",
              brightness: 128,
              maxBrightness: 255,
              percent: 50,
            },
            {
              name: "panel-b",
              brightness: 2048,
              maxBrightness: 4096,
              percent: 50,
            },
          ],
        },
      },
      battery: {
        status: "ok",
        readback: { percent: 74, status: "Discharging", supplies: [] },
      },
    })

    expect(surface.moonlight.bitrate).toEqual({ _tag: "known", value: 12_000 })
    expect(surface.linked.fps).toEqual({ _tag: "known", value: 60 })
    expect(surface.linked.resolution).toEqual({
      _tag: "known",
      value: RESOLUTION_STEPS.findIndex(step => step.width === 1920),
    })
    expect(surface.gamescope.filter).toEqual({ _tag: "known", value: "fsr" })
    expect(surface.brightness.unified).toEqual({ _tag: "known", value: 50 })
    expect(surface.battery).toEqual({
      percent: { _tag: "known", value: 74 },
      status: "Discharging",
    })
  })

  it("reports linked divergence instead of collapsing conflicts to unknown", () => {
    const surface = StreamControlSurface.fromState({
      moonlight: {
        status: "ok",
        readback: {
          bitrateKbps: null,
          fps: 60,
          resolution: { width: 1920, height: 1080 },
        },
      },
      gamescope: {
        status: "ok",
        readback: {
          resolution: { width: 1280, height: 720 },
          fps: 120,
          sharpness: null,
          filter: null,
        },
      },
      brightness: { status: "disabled" },
      battery: { status: "disabled" },
    })

    expect(surface.linked.fps).toEqual({
      _tag: "diverged",
      moonlight: 60,
      gamescope: 120,
    })
    expect(surface.linked.resolution).toEqual({
      _tag: "diverged",
      moonlight: RESOLUTION_STEPS.findIndex(step => step.width === 1920),
      gamescope: RESOLUTION_STEPS.findIndex(step => step.width === 1280),
    })
  })

  it("keeps unavailable subsystems distinct from missing readback", () => {
    const surface = StreamControlSurface.fromState({
      moonlight: { status: "error", error: "socket refused" },
      gamescope: { status: "disabled" },
      brightness: { status: "ok", readback: { devices: [], percent: null } },
      battery: {
        status: "ok",
        readback: { percent: null, status: null, supplies: [] },
      },
    })

    expect(surface.moonlight.fps).toEqual({
      _tag: "unavailable",
      reason: "socket refused",
    })
    expect(surface.gamescope.fps).toEqual({
      _tag: "unavailable",
      reason: "disabled",
    })
    expect(surface.linked.fps).toEqual({
      _tag: "unavailable",
      reason: "socket refused",
    })
    expect(surface.brightness.unified).toEqual({ _tag: "unknown" })
    expect(surface.battery.percent).toEqual({ _tag: "unknown" })
  })

  it("reports mixed brightness when display readbacks differ", () => {
    const surface = StreamControlSurface.fromState({
      moonlight: { status: "disabled" },
      gamescope: { status: "disabled" },
      brightness: {
        status: "ok",
        readback: {
          percent: 50,
          devices: [
            {
              name: "panel-a",
              brightness: 102,
              maxBrightness: 255,
              percent: 40,
            },
            {
              name: "panel-b",
              brightness: 2458,
              maxBrightness: 4096,
              percent: 60,
            },
          ],
        },
      },
      battery: { status: "disabled" },
    })

    expect(surface.brightness.unified).toEqual({
      _tag: "mixed",
      values: [40, 60],
    })
    expect(surface.brightness.devices).toEqual([
      { name: "panel-a", percent: { _tag: "known", value: 40 } },
      { name: "panel-b", percent: { _tag: "known", value: 60 } },
    ])
    expect(surface.battery.percent).toEqual({
      _tag: "unavailable",
      reason: "disabled",
    })
  })

  it("compares unified FPS by actual frame rate, not per-control slider index", () => {
    const bothThirty = StreamControlSurface.fromState({
      moonlight: {
        status: "ok",
        readback: { bitrateKbps: null, fps: 30, resolution: null },
      },
      gamescope: {
        status: "ok",
        readback: { fps: 30, resolution: null, sharpness: null, filter: null },
      },
      brightness: { status: "disabled" },
      battery: { status: "disabled" },
    })
    expect(bothThirty.linked.fps).toEqual({ _tag: "known", value: 30 })

    const falseAgreementRegression = StreamControlSurface.fromState({
      moonlight: {
        status: "ok",
        readback: { bitrateKbps: null, fps: 40, resolution: null },
      },
      gamescope: {
        status: "ok",
        readback: { fps: 30, resolution: null, sharpness: null, filter: null },
      },
      brightness: { status: "disabled" },
      battery: { status: "disabled" },
    })
    expect(falseAgreementRegression.linked.fps).toEqual({
      _tag: "diverged",
      moonlight: 40,
      gamescope: 30,
    })
    expect(LINKED_FPS_STEPS).toEqual([30, 45, 60, 75, 90, 120])
    expect(FPS_STEPS).toContain(40)
    expect(GAMESCOPE_FPS_STEPS).not.toContain(40)
  })

  it("reports linked unavailable when gamescope is down and moonlight has readback", () => {
    const surface = StreamControlSurface.fromState({
      moonlight: {
        status: "ok",
        readback: { bitrateKbps: null, fps: 60, resolution: null },
      },
      gamescope: { status: "error", error: "bridge down" },
      brightness: { status: "disabled" },
      battery: { status: "disabled" },
    })

    expect(surface.linked.fps).toEqual({
      _tag: "unavailable",
      reason: "bridge down",
    })
  })

  it("reports linked unknown when one subsystem is available but lacks a value", () => {
    const surface = StreamControlSurface.fromState({
      moonlight: {
        status: "ok",
        readback: { bitrateKbps: null, fps: 60, resolution: null },
      },
      gamescope: {
        status: "ok",
        readback: {
          fps: null,
          resolution: null,
          sharpness: null,
          filter: null,
        },
      },
      brightness: { status: "disabled" },
      battery: { status: "disabled" },
    })

    expect(surface.linked.fps).toEqual({ _tag: "unknown" })
  })

  it("handles missing subsystems, non-string errors, and unknown filters", () => {
    expect(StreamControlSurface.fromState({}).moonlight.fps).toEqual({
      _tag: "unavailable",
      reason: "missing",
    })

    expect(
      StreamControlSurface.fromState({
        moonlight: { status: "error" },
        gamescope: { status: "disabled" },
        brightness: { status: "disabled" },
        battery: { status: "disabled" },
      }).moonlight.fps,
    ).toEqual({ _tag: "unavailable", reason: "error" })

    expect(
      StreamControlSurface.fromState({
        moonlight: { status: "disabled" },
        gamescope: {
          status: "ok",
          readback: {
            fps: null,
            resolution: null,
            sharpness: null,
            filter: null,
          },
        },
        brightness: { status: "disabled" },
        battery: { status: "disabled" },
      }).gamescope.filter,
    ).toEqual({ _tag: "unknown" })
  })
})
