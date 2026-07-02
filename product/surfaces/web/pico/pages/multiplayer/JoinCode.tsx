/**
 * pico surface. ATOMIC LAYER: page.
 * Join by code / QR (static).
 */
import { Dim } from "../../ui/atoms/Dim"
import { Sub } from "../../ui/atoms/Sub"
import { Title } from "../../ui/atoms/Title"
import { ScreenShell } from "../../ui/templates/ScreenShell"

const QR_BITS = [
  "#######.#.#######",
  "#.....#.##.#.....#",
  "#.###.#.##.#.###.#",
  "#.###.#....#.###.#",
  "#.###.#.##.#.###.#",
  "#.....#.#..#.....#",
  "#######.#.#######",
  "........##.......",
  "##.#.##..#.#.##.#.",
  "..####.##..###..#",
  "#.#..#.####.#..##",
  "....##..#.#.##.#..",
  "#######.#.#.#..##",
  "#.....#..####.#.#",
  "#.###.#.#..##.##.",
  "#.###.#.####..#.#",
  "#.....#.#.#.####.",
]

export function JoinCode() {
  return (
    <ScreenShell
      title="PICO ▸ JOIN"
      hints={[{ key: "b", label: "BACK" }]}
      className="center"
    >
      <div className="pcMp-join">
        <div className="pcMp-qr" aria-hidden>
          {QR_BITS.map((rowBits, y) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static QR grid
            <div className="pcMp-qr-row" key={y}>
              {[...rowBits].map((bit, x) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: static QR grid
                  key={x}
                  className={bit === "#" ? "on" : ""}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="pcMp-join-side">
          <Title size={1}>SCAN TO JOIN</Title>
          <Sub>or enter the room code</Sub>
          <div className="pcMp-code">PICO-4F2A</div>
          <Dim>code refreshes every 60s</Dim>
        </div>
      </div>
    </ScreenShell>
  )
}
