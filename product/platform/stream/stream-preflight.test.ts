import { describe, expect, it } from "bun:test"
import { parseStreamBoundaryArgs } from "./stream-adaptive-boundaries"
import { selectStreamPreflightStartup } from "./stream-preflight"

describe("stream preflight", () => {
  it("selects a higher startup profile for excellent facts inside the ceiling", () => {
    const decision = selectStreamPreflightStartup({
      facts: {
        sourceReachable: true,
        streamControlReachable: true,
        latencyMs: 18,
      },
      boundaries: parseStreamBoundaryArgs(["bitrate=500k..40m"]),
    })

    expect(decision.status).toBe("selected")
    expect(decision.reasonCode).toBe("excellent-link")
    expect(decision.selectedStartupKbps).toBe(12_000)
    expect(decision.boundaries?.levers.bitrate).toEqual({
      floor: 500,
      startup: 12_000,
      ceiling: 40_000,
    })
  })

  it("uses conservative fallback startup when facts are unavailable", () => {
    const decision = selectStreamPreflightStartup({
      boundaries: parseStreamBoundaryArgs(["bitrate=500k..40m"]),
    })

    expect(decision.status).toBe("warning")
    expect(decision.reasonCode).toBe("no-facts")
    expect(decision.boundaries?.levers.bitrate).toEqual({
      floor: 500,
      startup: 3_000,
      ceiling: 40_000,
    })
  })

  it("honors explicit startup in optional mode but warns when unsafe", () => {
    const decision = selectStreamPreflightStartup({
      facts: {
        sourceReachable: true,
        streamControlReachable: true,
        latencyMs: 120,
      },
      boundaries: parseStreamBoundaryArgs(["bitrate=500k..6m..40m"]),
    })

    expect(decision.status).toBe("warning")
    expect(decision.reasonCode).toBe("explicit-startup-unsafe")
    expect(decision.boundaries?.levers.bitrate).toEqual({
      floor: 500,
      startup: 6_000,
      ceiling: 40_000,
    })
  })

  it("rejects unsafe explicit startup when preflight is required", () => {
    const decision = selectStreamPreflightStartup({
      mode: "required",
      facts: {
        sourceReachable: true,
        streamControlReachable: true,
        latencyMs: 120,
      },
      boundaries: parseStreamBoundaryArgs(["bitrate=500k..6m..40m"]),
    })

    expect(decision.status).toBe("rejected")
    expect(decision.reasonCode).toBe("explicit-startup-unsafe")
  })

  it("rejects required preflight when facts are missing", () => {
    const decision = selectStreamPreflightStartup({
      mode: "required",
      boundaries: parseStreamBoundaryArgs(["bitrate=500k..40m"]),
    })

    expect(decision.status).toBe("rejected")
    expect(decision.reasonCode).toBe("no-facts")
  })

  it("respects a configured floor above the safe profile", () => {
    const decision = selectStreamPreflightStartup({
      facts: {
        sourceReachable: true,
        streamControlReachable: true,
        latencyMs: 140,
      },
      boundaries: parseStreamBoundaryArgs(["bitrate=5m..40m"]),
    })

    expect(decision.status).toBe("warning")
    expect(decision.reasonCode).toBe("floor-binding")
    expect(decision.boundaries?.levers.bitrate).toEqual({
      floor: 5_000,
      startup: 5_000,
      ceiling: 40_000,
    })
  })

  it("skips launches without explicit bitrate policy in optional mode", () => {
    const decision = selectStreamPreflightStartup()

    expect(decision.status).toBe("skipped")
    expect(decision.reasonCode).toBe("no-stream-policy")
  })
})
