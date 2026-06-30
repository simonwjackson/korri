import type { ReactNode } from "react"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftCineChip } from "./ShiftCineChip"

const note = "Tone"
const frame = (children: ReactNode) => (
  <ShiftPartFrame width={300} height={120}>
    {children}
  </ShiftPartFrame>
)

export const ShiftCineChipStates = [
  {
    name: "Chip",
    note,
    state: "Default",
    render: () => frame(<ShiftCineChip>Metroidvania</ShiftCineChip>),
  },
  {
    name: "Chip",
    note,
    state: "Favorite",
    render: () =>
      frame(<ShiftCineChip tone="favorite">★ Favorite</ShiftCineChip>),
  },
  {
    name: "Chip",
    note,
    state: "Reason",
    render: () =>
      frame(<ShiftCineChip tone="reason">It didn't start</ShiftCineChip>),
  },
]
