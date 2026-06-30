import type { ReactNode } from "react"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftCineHint } from "./ShiftCineHint"

const note = "Emphasis"
const frame = (children: ReactNode) => (
  <ShiftPartFrame width={260} height={120}>
    {children}
  </ShiftPartFrame>
)

export const ShiftCineHintStates = [
  {
    name: "Hint",
    note,
    state: "Default",
    render: () => frame(<ShiftCineHint glyph="X" label="Options" />),
  },
  {
    name: "Hint",
    note,
    state: "Primary",
    render: () => frame(<ShiftCineHint glyph="A" label="Play" primary />),
  },
]
