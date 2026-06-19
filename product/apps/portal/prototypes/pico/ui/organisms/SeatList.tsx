/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Connected seats/devices with kind, battery (or AC), and active/idle status.
 */
import type { PicoSeat } from "../../fixtures-extra"
import { List, Row } from "../../screens/kit"

export function SeatList({ seats }: { readonly seats: readonly PicoSeat[] }) {
  return (
    <List>
      {seats.map(seat => (
        <Row
          key={seat.id}
          icon="◉"
          label={seat.name}
          meta={
            <span className="pcMd-seat-meta">
              <span className="pcMd-seat-kind">{seat.kind}</span>
              {seat.battery !== null ? (
                <span className="pcMd-seat-batt">▮ {seat.battery}%</span>
              ) : (
                <span className="pcMd-seat-batt off">— AC</span>
              )}
            </span>
          }
          trailing={
            <span className={`pcMd-active ${seat.active ? "on" : ""}`}>
              {seat.active ? "ACTIVE" : "IDLE"}
            </span>
          }
        />
      ))}
    </List>
  )
}
