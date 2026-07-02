/**
 * Shift — the status-bar connectivity icon (atom).
 *
 * Owns the Wifi / WifiOff choice from the network reading, so the status bar
 * just hands it the reading.
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
} from "../../shift-network-state"

export function ShiftNetworkIcon({
  network = DEFAULT_SHIFT_NETWORK_READING,
}: {
  readonly network?: ShiftNetworkReading
}) {
  const Icon = shiftNetworkConnected(network) ? Wifi : WifiOff
  return (
    <Icon
      className="shift-cine-status-icon"
      aria-hidden
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.networkIcon)}
    />
  )
}
