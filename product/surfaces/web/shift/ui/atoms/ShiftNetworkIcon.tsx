/**
 * Shift — the status-bar connectivity icon (atom).
 *
 * Owns the Wifi / WifiOff / omitted choice from the network reading, so the
 * status bar just hands it the reading. Unknown readings intentionally render
 * nothing instead of falling back to the fixture default connected state.
 */
import { Wifi, WifiOff } from "lucide-react"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import {
  DEFAULT_SHIFT_NETWORK_READING,
  type ShiftNetworkReading,
  shiftNetworkConnected,
  shiftNetworkDisplayLabel,
} from "../../shift-network-state"

export function ShiftNetworkIcon({
  network = DEFAULT_SHIFT_NETWORK_READING,
}: {
  readonly network?: ShiftNetworkReading
}) {
  if (network._tag === "Unknown") return null

  const Icon = shiftNetworkConnected(network) ? Wifi : WifiOff
  return (
    <span aria-label={shiftNetworkDisplayLabel(network)}>
      <Icon
        className="shift-cine-status-icon"
        aria-hidden
        {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.networkIcon)}
      />
    </span>
  )
}
