import { describe, expect, it } from "bun:test"
import { type ProviderId, pluginRecordId } from "@platform/plugin"
import {
  FPS_STEPS,
  RESOLUTION_STEPS,
  StreamControlSurface,
} from "@platform/stream-control/control-surface"
import type { StreamControlCapability } from "./control-contract"

const provider = "@example:presentation" as ProviderId

describe("StreamControlSurface", () => {
  it("derives built-in and provider readbacks from typed state", () => {
    const fpsControl = providerControl("fps", "fps")
    const filterControl = providerControl("filter", "filter")
    const surface = StreamControlSurface.fromState({
      plugins: {
        "@korri:moonlight": {
          status: "ok",
          readback: {
            bitrate: 12_000,
            fps: 60,
            resolution: { width: 1920, height: 1080 },
          },
        },
        [provider]: {
          status: "ok",
          readback: {
            fps: 60,
            filter: "fsr",
          },
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

    expect(surface.pluginReadback("@korri:moonlight", "bitrate")).toEqual({
      _tag: "known",
      value: 12_000,
    })
    expect(surface.pluginReadback("@korri:moonlight", "resolution")).toEqual({
      _tag: "known",
      value: RESOLUTION_STEPS.findIndex(step => step.width === 1920),
    })
    expect(surface.readControl(fpsControl)).toEqual({
      _tag: "known",
      value: 60,
    })
    expect(surface.readControl(filterControl)).toEqual({
      _tag: "known",
      value: "fsr",
    })
    expect(surface.brightness.unified).toEqual({ _tag: "known", value: 50 })
    expect(surface.battery).toEqual({
      percent: { _tag: "known", value: 74 },
      status: "Discharging",
    })
  })

  it("keeps unavailable subsystems distinct from missing readback", () => {
    const surface = StreamControlSurface.fromState({
      plugins: {
        "@korri:moonlight": { status: "error", error: "socket refused" },
        [provider]: { status: "disabled" },
      },
      brightness: { status: "ok", readback: { devices: [], percent: null } },
      battery: {
        status: "ok",
        readback: { percent: null, status: null, supplies: [] },
      },
    })

    expect(surface.pluginReadback("@korri:moonlight", "fps")).toEqual({
      _tag: "unavailable",
      reason: "socket refused",
    })
    expect(surface.readControl(providerControl("fps", "fps"))).toEqual({
      _tag: "unavailable",
      reason: "disabled",
    })
    expect(surface.brightness.unified).toEqual({ _tag: "unknown" })
    expect(surface.battery.percent).toEqual({ _tag: "unknown" })
  })

  it("reports mixed brightness when display readbacks differ", () => {
    const surface = StreamControlSurface.fromState({
      plugins: {},
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

  it("keeps the Moonlight FPS ladder intact", () => {
    expect(FPS_STEPS).toContain(40)
  })
})

function providerControl(
  localId: string,
  readbackId: string,
): StreamControlCapability {
  return {
    id: pluginRecordId(provider, localId),
    label: localId,
    subsystem: "presentation",
    provider,
    access: "read-write",
    status: "supported",
    unavailableReason: null,
    action: pluginRecordId(provider, `${localId}.set`),
    readback: pluginRecordId(provider, readbackId),
    value: { kind: "range", min: 0, max: 120, step: 1 },
  }
}
