/**
 * Shift — the status-bar connectivity icon (atom).
 *
 * Owns the connected / omitted choice from the network reading, so the status
 * bar just hands it the reading. Non-connected readings intentionally render
 * nothing instead of falling back to the fixture default connected state.
 */
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import {
  DEFAULT_SHIFT_NETWORK_READING,
  networkStrengthLabel,
  type ShiftNetworkReading,
  shiftNetworkDisplayLabel,
  shiftNetworkDisplayName,
} from "../../shift-network-state"

export function ShiftNetworkIcon({
  network = DEFAULT_SHIFT_NETWORK_READING,
}: {
  readonly network?: ShiftNetworkReading
}) {
  if (network._tag !== "Connected") return null

  const label = shiftNetworkDisplayLabel(network)
  const strength = shiftNetworkStrength(network)

  return (
    <span
      className="shift-cine-network"
      role="img"
      aria-label={label}
      data-shift-network-strength={strength}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.networkIcon)}
    >
      <span className="shift-cine-network-signal" aria-hidden>
        <span className="shift-cine-network-bar shift-cine-network-bar-1" />
        <span className="shift-cine-network-bar shift-cine-network-bar-2" />
        <span className="shift-cine-network-bar shift-cine-network-bar-3" />
      </span>
      <span className="shift-cine-network-name">
        {shiftNetworkDisplayName(network)}
      </span>
    </span>
  )
}

function shiftNetworkStrength(
  network: ShiftNetworkReading,
): "none" | "unknown" | "weak" | "good" | "strong" {
  if (network._tag === "Disconnected") return "none"
  if (network._tag !== "Connected" || network.strengthPercent === null) {
    return "unknown"
  }
  switch (networkStrengthLabel(network.strengthPercent)) {
    case "Weak":
      return "weak"
    case "Good":
      return "good"
    case "Strong":
      return "strong"
  }
}
