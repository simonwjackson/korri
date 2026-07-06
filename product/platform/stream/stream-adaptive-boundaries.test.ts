import { describe, expect, it } from "bun:test"
import {
  defaultStreamBoundaries,
  mergeStreamBoundaries,
  parseStreamBoundaryArgs,
  serializeStreamBoundaries,
} from "./stream-adaptive-boundaries"

describe("stream adaptive boundaries", () => {
  it("parses range, pin, ceiling-only, floor-only, and auto lever grammar", () => {
    const boundaries = parseStreamBoundaryArgs([
      "bitrate=5000..20000",
      "fps=60",
      "resolution=..1280x720",
    ])

    expect(boundaries.levers.bitrate).toEqual({ floor: 5000, ceiling: 20000 })
    expect(boundaries.levers.fps).toEqual({ floor: 60, ceiling: 60, pinned: 60 })
    expect(boundaries.levers.resolution?.ceiling).toEqual({ width: 1280, height: 720 })

    expect(parseStreamBoundaryArgs(["bitrate=5000.."]).levers.bitrate).toEqual({ floor: 5000 })
    expect(parseStreamBoundaryArgs(["bitrate=..20000"]).levers.bitrate).toEqual({ ceiling: 20000 })
    expect(parseStreamBoundaryArgs(["bitrate=auto"]).levers.bitrate).toEqual({ free: true })
    expect(parseStreamBoundaryArgs(["bitrate=.."]).levers.bitrate).toEqual({ free: true })
  })

  it("normalizes bitrate units and outcome clamps", () => {
    expect(parseStreamBoundaryArgs(["bitrate=8mbps"]).levers.bitrate).toEqual({
      floor: 8000,
      ceiling: 8000,
      pinned: 8000,
    })
    expect(parseStreamBoundaryArgs(["bitrate=8000k"]).levers.bitrate).toEqual({
      floor: 8000,
      ceiling: 8000,
      pinned: 8000,
    })

    const boundaries = parseStreamBoundaryArgs([
      "max-latency=50ms",
      "min-fps=30",
      "lean=responsive",
    ])

    expect(boundaries.outcomes.maxLatencyMs).toBe(50)
    expect(boundaries.outcomes.minDeliveredFps).toBe(30)
    expect(boundaries.lean).toBe(0)
  })

  it("merges layers with last expression wins semantics", () => {
    const defaults = parseStreamBoundaryArgs(["bitrate=5000..20000", "lean=cinematic"])
    const launch = parseStreamBoundaryArgs(["bitrate=..12000"])
    const live = parseStreamBoundaryArgs(["bitrate=auto", "lean=balanced"])

    expect(mergeStreamBoundaries(defaults, launch, live)).toEqual({
      ...defaultStreamBoundaries(),
      levers: { bitrate: { free: true } },
      outcomes: {},
      lean: 0.5,
      auto: undefined,
    })
  })

  it("serializes to an equivalent flat key set", () => {
    const boundaries = parseStreamBoundaryArgs([
      "bitrate=5000..20000",
      "fps=60",
      "resolution=..1280x720",
      "max-latency=50ms",
      "min-fps=30",
      "lean=0.25",
      "auto=on",
    ])

    expect(serializeStreamBoundaries(boundaries)).toEqual([
      "bitrate=5000..20000",
      "fps=60",
      "resolution=..1280x720",
      "lean=0.25",
      "auto=on",
      "max-latency=50ms",
      "min-fps=30",
    ])
  })

  it("rejects malformed or inverted ranges", () => {
    expect(() => parseStreamBoundaryArgs(["bitrate=5000..20000..30000"])).toThrow(
      /invalid range/i,
    )
    expect(() => parseStreamBoundaryArgs(["bitrate=20000..5000"])).toThrow(
      /floor.*ceiling/i,
    )
    expect(() => parseStreamBoundaryArgs(["resolution=1280x720..640x360"])).toThrow(
      /floor.*ceiling/i,
    )
  })
})
