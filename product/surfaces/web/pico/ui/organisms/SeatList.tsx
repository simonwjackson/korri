/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Connected seats/devices with kind, battery (or AC), and active/idle status.
 */
import type { PicoSeat } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { List } from "../molecules/List"
import { Row } from "../molecules/Row"

export function SeatList({ seats }: { readonly seats: readonly PicoSeat[] }) {
  return (
    <List partAttrs={picoDesignPartAttrs(PICO_DESIGN_PARTS.seatList)}>
      {seats.map(seat => (
        <Row
          key={seat.id}
          icon="◉"
          label={seat.name}
          meta={
            <span
              className="pcMd-seat-meta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdSeatMeta)}
            >
              <span
                className="pcMd-seat-kind"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdSeatKind)}
              >
                {seat.kind}
              </span>
              {seat.battery !== null ? (
                <span
                  className="pcMd-seat-batt"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdSeatBatt)}
                >
                  ▮ {seat.battery}%
                </span>
              ) : (
                <span
                  className="pcMd-seat-batt off"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdSeatBatt)}
                >
                  — AC
                </span>
              )}
            </span>
          }
          trailing={
            <span
              className={`pcMd-active ${seat.active ? "on" : ""}`}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdActive)}
            >
              {seat.active ? "ACTIVE" : "IDLE"}
            </span>
          }
        />
      ))}
    </List>
  )
}
