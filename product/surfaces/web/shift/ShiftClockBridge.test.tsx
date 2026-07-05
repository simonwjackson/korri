import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomValue } from "@effect/atom-react"
import type { MinuteClock } from "@platform/device/device-clock"
import { cleanup, render, screen } from "@testing-library/react"
import { ShiftClockBridge } from "./ShiftClockBridge"
import { shiftClockIsoAtom, shiftClockIsoForInstant } from "./shift-clock-state"

afterEach(cleanup)

function ClockProbe() {
  return <output>{useAtomValue(shiftClockIsoAtom)}</output>
}

function fixedClock(now: Date): MinuteClock {
  return {
    subscribe(listener) {
      listener(now)
      return () => undefined
    },
  }
}

describe("ShiftClockBridge", () => {
  it("presents the live instant to the surface through shiftClockIsoAtom", () => {
    const now = new Date("2026-06-30T23:24:00.000Z")

    render(
      <RegistryProvider>
        <ShiftClockBridge createClock={() => fixedClock(now)} />
        <ClockProbe />
      </RegistryProvider>,
    )

    expect(screen.getByRole("status").textContent).toBe(
      shiftClockIsoForInstant(now),
    )
  })
})
