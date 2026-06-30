import type { ReactNode } from "react"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftCineKicker } from "./ShiftCineKicker"

const note = "Launch"
const frame = (children: ReactNode) => (
  <ShiftPartFrame width={320} height={100}>
    {children}
  </ShiftPartFrame>
)

export const ShiftCineKickerStates = [
  {
    name: "Kicker",
    note,
    state: "Ready",
    render: () => frame(<ShiftCineKicker>Ready to play</ShiftCineKicker>),
  },
  {
    name: "Kicker",
    note,
    state: "Launching",
    render: () =>
      frame(<ShiftCineKicker tone="launching">Starting…</ShiftCineKicker>),
  },
  {
    name: "Kicker",
    note,
    state: "Failed",
    render: () =>
      frame(<ShiftCineKicker tone="failed">Couldn't start</ShiftCineKicker>),
  },
]
