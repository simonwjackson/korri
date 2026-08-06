import type { SurfaceLaunchLocation } from "@contracts/surface/korri-surface"
import { ShiftSheetAction } from "../molecules/ShiftSheetAction"
import { ShiftSheetBody } from "./ShiftSheetBody"
import { ShiftSheetGroup } from "./ShiftSheetGroup"
import { ShiftSheetHeader } from "./ShiftSheetHeader"
import { ShiftSheetPanel } from "./ShiftSheetPanel"
import { ShiftSheetRoot } from "./ShiftSheetRoot"
import { ShiftSheetTitle } from "./ShiftSheetTitle"

export interface ShiftLaunchLocationSheetProps {
  readonly open: boolean
  readonly gameTitle: string
  readonly locations: readonly SurfaceLaunchLocation[]
  readonly onSelect: (locationId: string) => void
  readonly onClose: () => void
}

/** A folded game never silently chooses a device; Shift asks first. */
export function ShiftLaunchLocationSheet({
  open,
  gameTitle,
  locations,
  onSelect,
  onClose,
}: ShiftLaunchLocationSheetProps) {
  return (
    <ShiftSheetRoot
      open={open}
      onClose={onClose}
      label={`Choose where to play ${gameTitle}`}
    >
      <ShiftSheetPanel>
        <ShiftSheetHeader>
          <ShiftSheetTitle>{gameTitle}</ShiftSheetTitle>
        </ShiftSheetHeader>
        <ShiftSheetBody>
          <ShiftSheetGroup title="Play on">
            {locations.map(location => (
              <ShiftSheetAction
                key={location.id}
                label={location.label}
                launchLocationId={location.id}
                onSelect={() => onSelect(location.id)}
              />
            ))}
          </ShiftSheetGroup>
        </ShiftSheetBody>
      </ShiftSheetPanel>
    </ShiftSheetRoot>
  )
}
