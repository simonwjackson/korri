/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The save/load state slot grid. In `load` mode the selected non-empty slot
 * gets a restore affordance.
 */
export type SaveSlot = {
  readonly index: number
  readonly label: string
  readonly stamp: string
  readonly empty: boolean
}

export function SaveSlotGrid({
  slots,
  mode,
}: {
  readonly slots: readonly SaveSlot[]
  readonly mode: "save" | "load"
}) {
  return (
    <div className={`pcIg-slots ${mode === "load" ? "load" : ""}`}>
      {slots.map((slot, index) => (
        <div
          key={slot.index}
          className={`pcIg-slot ${slot.empty ? "empty" : ""} ${index === 0 ? "sel" : ""}`}
        >
          <span className="pcIg-slot-no">{slot.index}</span>
          <span className="pcIg-slot-label">{slot.label}</span>
          <span className="pcIg-slot-stamp">
            {slot.empty ? "empty — your story goes here" : slot.stamp}
          </span>
          {mode === "load" && index === 0 && !slot.empty ? (
            <span className="pcIg-slot-restore">↺ RESTORE</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
