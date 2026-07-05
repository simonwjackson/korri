import { useAtomSet } from "@effect/atom-react"
import {
  createMinuteClock,
  type MinuteClock,
} from "@platform/device/device-clock"
import { useEffect } from "react"
import { shiftClockIsoAtom, shiftClockIsoForInstant } from "./shift-clock-state"

/**
 * Presents the live wall-clock to the Shift surface by feeding
 * `shiftClockIsoAtom` from the platform minute clock. It mounts in the surface
 * composition root (`entry.tsx`), never inside a rendering component, so the
 * status bar stays a pure reader: it is handed the time exactly the way it is
 * handed battery, and no view reaches for the clock itself.
 *
 * `createClock` is injectable so tests and harnesses drive a deterministic
 * source; production uses the real minute-aligned ticker.
 */
export function ShiftClockBridge({
  createClock = createMinuteClock,
}: {
  readonly createClock?: () => MinuteClock
}) {
  const setClock = useAtomSet(shiftClockIsoAtom)

  useEffect(() => {
    const clock = createClock()
    return clock.subscribe(now => setClock(shiftClockIsoForInstant(now)))
  }, [createClock, setClock])

  return null
}
