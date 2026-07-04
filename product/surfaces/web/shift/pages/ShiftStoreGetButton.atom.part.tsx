/**
 * Store Get Button atom catalog entry — the acquire affordance across its three
 * real states: Get (available), Getting… (acquiring, inert), Play (ready).
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreGetButton } from "./ShiftStoreGetButton"

const frame = (node: React.ReactNode) => (
  <ShiftPartFrame height={90}>
    <div data-shift-store className="intrinsic">
      {node}
    </div>
  </ShiftPartFrame>
)

export const ShiftStoreGetButtonStates = [
  {
    id: "shift-store-get-available",
    state: "Available",
    render: () =>
      frame(<ShiftStoreGetButton status="available" title="Celeste" />),
  },
  {
    id: "shift-store-get-acquiring",
    state: "Acquiring",
    render: () =>
      frame(<ShiftStoreGetButton status="acquiring" title="Celeste" />),
  },
  {
    id: "shift-store-get-ready",
    state: "Ready",
    render: () => frame(<ShiftStoreGetButton status="ready" title="Celeste" />),
  },
].map(story => ({
  ...story,
  designPartId: SHIFT_DESIGN_PARTS.storeGetButton.id,
  layer: "atom" as const,
  name: "Store Get Button",
  note: "Acquire states",
})) satisfies readonly Story[]
