/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The console / system picker grid: each system with its name + game count, the
 * first one selected. Stat atom still comes from the kit barrel until it migrates.
 */
import type { PicoSystem } from "../../data/pico-catalog-service"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Stat } from "../atoms/Stat"

export function SystemGrid({
  systems,
}: {
  readonly systems: readonly PicoSystem[]
}) {
  return (
    <div
      className="pcLib-systems"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.systemGrid)}
    >
      {systems.map((system, index) => (
        <div
          key={system.id}
          className={`pcLib-system ${index === 0 ? "sel" : ""}`}
        >
          <div className="pcLib-system-name">{system.name}</div>
          <Stat label="GAMES" value={system.count} />
        </div>
      ))}
    </div>
  )
}
