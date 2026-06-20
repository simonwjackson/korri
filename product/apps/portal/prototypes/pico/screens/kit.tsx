/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Compatibility barrel. Every presentational primitive now lives in its own
 * atomic-design file under `../ui/{atoms,molecules,organisms}`; this re-exports
 * them so the not-yet-rewritten screens keep importing from `kit` unchanged.
 * New code should import from the atomic layer directly. Slated for removal once
 * every consumer points at the layer.
 */
export { PicoArtImage } from "../PicoArtImage"
export { PicoCart } from "../PicoCart"
export { PicoIcon } from "../PicoIcon"
export { PicoMascot } from "../PicoMascot"
export { ScreenShell as Screen } from "../ui/templates/ScreenShell"
// Atoms.
export { Badge } from "../ui/atoms/Badge"
export { BlockBar } from "../ui/atoms/BlockBar"
export { Btn } from "../ui/atoms/Btn"
export { Chip } from "../ui/atoms/Chip"
export { Dim } from "../ui/atoms/Dim"
export { Glyph } from "../ui/atoms/Glyph"
export { Progress } from "../ui/atoms/Progress"
export { Spinner } from "../ui/atoms/Spinner"
export { Stat } from "../ui/atoms/Stat"
export { Sub } from "../ui/atoms/Sub"
export { Title } from "../ui/atoms/Title"
export { Toggle } from "../ui/atoms/Toggle"
// Molecules.
export { Card } from "../ui/molecules/Card"
export { List } from "../ui/molecules/List"
export { Opt } from "../ui/molecules/Opt"
export { Player, type PlayerRep } from "../ui/molecules/Player"
export { Row } from "../ui/molecules/Row"
export { Tabs } from "../ui/molecules/Tabs"
// Organisms.
export { Hero } from "../ui/organisms/Hero"
export { Modal } from "../ui/organisms/Modal"
