/** Network Icon atom catalog entry — connected and disconnected. */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_DESIGN_PARTS } from "../../shift-design-parts"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftNetworkIcon } from "./ShiftNetworkIcon"

export const ShiftNetworkIconStates = [
  {
    state: "Connected",
    network: { _tag: "Connected", strengthPercent: 80 } as const,
  },
  { state: "Disconnected", network: { _tag: "Disconnected" } as const },
].map(({ state, network }) => ({
  id: `shift-network-icon-${state.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.networkIcon.id,
  layer: "atom" as const,
  name: "Network Icon",
  note: "Network states",
  state,
  render: () => (
    <ShiftPartFrame height={60}>
      <ShiftNetworkIcon network={network} />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
