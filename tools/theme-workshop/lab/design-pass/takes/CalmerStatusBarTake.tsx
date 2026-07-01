import {
  DEFAULT_SHIFT_CLOCK_ISO,
  shiftClockLabelForIso,
} from "@product/surfaces/web/shift/shift-clock-state"
import { shiftBatteryPropsForPowerReading } from "@product/surfaces/web/shift/shift-power-state"
import { ShiftStatusBar } from "@product/surfaces/web/shift/ui/molecules/ShiftStatusBar"
import { ShiftPartFrame } from "@product/surfaces/web/shift/ui/ShiftPartFrame"

export const CalmerStatusBarTake = {
  name: "Calmer status bar",
  note: "Hand-authored spike take",
  render: () => (
    <ShiftPartFrame height={140}>
      <ShiftStatusBar
        time={shiftClockLabelForIso(DEFAULT_SHIFT_CLOCK_ISO)}
        avatarSrc="https://i.pravatar.cc/96?u=korri-shift-calm"
        battery={shiftBatteryPropsForPowerReading({
          percent: 84,
          charging: true,
        })}
        network={{ _tag: "Connected", strengthPercent: 72 }}
      />
    </ShiftPartFrame>
  ),
}
