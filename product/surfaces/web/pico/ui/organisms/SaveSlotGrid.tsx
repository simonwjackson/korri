/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The save/load state slot grid. In `load` mode the selected filled slot gets a
 * restore affordance.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
export type SaveSlot =
  | {
      readonly _tag: "Filled"
      readonly index: number
      readonly label: string
      readonly stamp: string
    }
  | {
      readonly _tag: "Empty"
      readonly index: number
      readonly label: string
    }

export function SaveSlotGrid({
  slots,
  mode,
}: {
  readonly slots: readonly SaveSlot[]
  readonly mode: "save" | "load"
}) {
  return (
    <div
      className={`pcIg-slots ${mode === "load" ? "load" : ""}`}
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.saveSlotGrid)}
    >
      {slots.map((slot, index) => (
        <div
          key={slot.index}
          className={`pcIg-slot ${slot._tag === "Empty" ? "empty" : ""} ${index === 0 ? "sel" : ""}`}
        >
          <span className="pcIg-slot-no">{slot.index}</span>
          <span className="pcIg-slot-label">{slot.label}</span>
          <span className="pcIg-slot-stamp">
            {slot._tag === "Empty"
              ? "empty — your story goes here"
              : slot.stamp}
          </span>
          {mode === "load" && index === 0 && slot._tag === "Filled" ? (
            <span className="pcIg-slot-restore">↺ RESTORE</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
