/**
 * Store Filter Chip atom catalog entry — the chip's presentation variants (the
 * candidates under exploration), each shown selected beside an idle sibling so
 * the pair can be judged per variant.
 */
import type { Story } from "@simonwjackson/caliper"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import {
  type ShiftStoreChipVariant,
  ShiftStoreSourceChip,
} from "./ShiftStoreSourceChip"

const VARIANTS: readonly ShiftStoreChipVariant[] = [
  "pill",
  "underline",
  "dot",
  "kicker",
  "cursor",
  "type",
]

const pair = (variant: ShiftStoreChipVariant) => (
  <ShiftPartFrame>
    <div
      data-shift-store
      className="intrinsic"
      style={{ display: "flex", gap: "var(--shift-space-3)" }}
    >
      <ShiftStoreSourceChip
        variant={variant}
        label="itch.io"
        count={6}
        active={false}
        onClick={() => undefined}
      />
      <ShiftStoreSourceChip
        variant={variant}
        label="Community"
        count={4}
        active
        onClick={() => undefined}
      />
    </div>
  </ShiftPartFrame>
)

export const ShiftStoreSourceChipStates = VARIANTS.map(variant => ({
  id: `shift-store-chip-${variant}`,
  state: variant.charAt(0).toUpperCase() + variant.slice(1),
  render: () => pair(variant),
  designPartId: SHIFT_DESIGN_PARTS.storeChip.id,
  layer: "atom" as const,
  name: "Store Filter Chip",
  note: "Chip variants",
})) satisfies readonly Story[]
