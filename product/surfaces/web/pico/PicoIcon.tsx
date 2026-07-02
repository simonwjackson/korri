/**
 * pico surface.
 *
 * A cohesive hand-drawn pixel-icon set (same hand as Pixl) to replace borrowed
 * Unicode glyphs (▶ ◐ ⏻ ✕ ⚙ ★ ◂ ▸) with one consistent family. Each icon is an
 * 8×8 bitmap (`#` = filled), rendered as crisp SVG in `currentColor` and sized
 * in `em`, so it inherits color + the intrinsic token scale wherever it sits.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "./pico-design-parts"

const ICONS = {
  play: [
    "........",
    ".#......",
    ".###....",
    ".#####..",
    ".#####..",
    ".###....",
    ".#......",
    "........",
  ],
  back: [
    "........",
    "......#.",
    "....###.",
    "..#####.",
    "..#####.",
    "....###.",
    "......#.",
    "........",
  ],
  pause: [
    "........",
    ".##..##.",
    ".##..##.",
    ".##..##.",
    ".##..##.",
    ".##..##.",
    ".##..##.",
    "........",
  ],
  star: [
    "...#....",
    "...#....",
    "#######.",
    ".#####..",
    "..###...",
    ".##.##..",
    "##...##.",
    "........",
  ],
  check: [
    "........",
    "......#.",
    ".....##.",
    "#...##..",
    "##.##...",
    ".####...",
    "..##....",
    "........",
  ],
  close: [
    "........",
    ".#....#.",
    ".##..##.",
    "..####..",
    "..####..",
    ".##..##.",
    ".#....#.",
    "........",
  ],
  download: [
    "...##...",
    "...##...",
    "...##...",
    ".######.",
    "..####..",
    "...##...",
    "........",
    ".######.",
  ],
  menu: [
    "........",
    ".######.",
    "........",
    ".######.",
    "........",
    ".######.",
    "........",
    "........",
  ],
  plus: [
    "........",
    "...##...",
    "...##...",
    ".######.",
    ".######.",
    "...##...",
    "...##...",
    "........",
  ],
  power: [
    "...##...",
    ".#.##.#.",
    "##.##.##",
    "##....##",
    "##....##",
    ".##..##.",
    "..####..",
    "........",
  ],
  gear: [
    "...##...",
    ".#.##.#.",
    ".######.",
    "##.##.##",
    "##.##.##",
    ".######.",
    ".#.##.#.",
    "...##...",
  ],
  search: [
    ".####...",
    ".#..#...",
    ".#..#...",
    ".####...",
    "....##..",
    ".....##.",
    "........",
    "........",
  ],
  wifi: [
    "......##",
    "......##",
    "...##.##",
    "...##.##",
    "##.##.##",
    "##.##.##",
    "##.##.##",
    "........",
  ],
  pad: [
    "........",
    "........",
    "##....##",
    "########",
    "########",
    "#.#..#.#",
    "........",
    "........",
  ],
  moon: [
    "..###...",
    ".##.....",
    "###.....",
    "###.....",
    "###.....",
    ".##.....",
    "..###...",
    "........",
  ],
  restart: [
    "..####..",
    ".#...#.#",
    "#.....##",
    "#.....#.",
    "#.......",
    ".#....#.",
    "..####..",
    "........",
  ],
  exit: [
    "........",
    "#...#...",
    "#...##..",
    "#..####.",
    "#...##..",
    "#...#...",
    "........",
    "........",
  ],
} as const

export type PicoIconName = keyof typeof ICONS

export function PicoIcon({
  name,
  className,
}: {
  readonly name: PicoIconName
  readonly className?: string
}) {
  const rows = ICONS[name]
  const cells = rows.flatMap((row, y) =>
    [...row].flatMap((cell, x) => {
      if (cell !== "#") return []
      // biome-ignore lint/suspicious/noArrayIndexKey: static pixel grid; (x,y) are fixed cell coordinates
      return [<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />]
    }),
  )
  return (
    <svg
      className={`pcIcon ${className ?? ""}`}
      viewBox="0 0 8 8"
      aria-hidden
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.icon)}
    >
      <title>{name}</title>
      {cells}
    </svg>
  )
}
