import { describe, expect, it } from "bun:test"
import {
  shiftClockIsoForInstant,
  shiftClockLabelForIso,
} from "./shift-clock-state"

describe("shiftClockIsoForInstant", () => {
  it("encodes local wall-clock into the ISO's UTC fields", () => {
    // PST (UTC-8): getTimezoneOffset() === 480. 23:24Z is 15:24 locally.
    const iso = shiftClockIsoForInstant(
      new Date("2026-06-30T23:24:00.000Z"),
      480,
    )

    expect(iso).toBe("2026-06-30T15:24:00.000Z")
    expect(shiftClockLabelForIso(iso)).toBe("3:24 PM")
  })

  it("is an identity for a UTC device (zero offset)", () => {
    const iso = shiftClockIsoForInstant(new Date("2026-06-30T16:24:00.000Z"), 0)

    expect(iso).toBe("2026-06-30T16:24:00.000Z")
    expect(shiftClockLabelForIso(iso)).toBe("4:24 PM")
  })

  it("handles zones ahead of UTC (negative offset)", () => {
    // CEST (UTC+2): getTimezoneOffset() === -120. 07:05Z is 09:05 locally.
    const iso = shiftClockIsoForInstant(
      new Date("2026-06-30T07:05:00.000Z"),
      -120,
    )

    expect(iso).toBe("2026-06-30T09:05:00.000Z")
    expect(shiftClockLabelForIso(iso)).toBe("9:05 AM")
  })
})
