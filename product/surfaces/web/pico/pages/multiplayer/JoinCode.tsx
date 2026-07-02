/**
 * pico surface. ATOMIC LAYER: page.
 * Join by code / QR (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
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
      <div
        className="pcMp-join"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpJoin)}
      >
        <div
          className="pcMp-qr"
          aria-hidden
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpQr)}
        >
          {QR_BITS.map((rowBits, y) => (
            <div
              className="pcMp-qr-row"
              // biome-ignore lint/suspicious/noArrayIndexKey: static QR grid
              key={y}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpQrRow)}
            >
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
        <div
          className="pcMp-join-side"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpJoinSide)}
        >
          <Title size={1}>SCAN TO JOIN</Title>
          <Sub>or enter the room code</Sub>
          <div
            className="pcMp-code"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpCode)}
          >
            PICO-4F2A
          </div>
          <Dim>code refreshes every 60s</Dim>
        </div>
      </div>
    </ScreenShell>
  )
}
