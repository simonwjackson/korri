/**
 * Cinematic Home template catalog entry — the Home LAYOUT (backdrop, status
 * bar, hero, rail, legend arranged around a `games` slot). The Home *page*
 * (`ShiftHome.page.part`) is this template bound to the live catalog Data and
 * foreground state machines; here it renders from fixtures as a pure layout.
 */
import { SHIFT_CINEMATIC_GAMES } from "./config"
import { ShiftCinematicHome } from "./pages/ShiftCinematicHome"
import { SHIFT_DESIGN_PARTS } from "./shift-design-parts"

export default {
  designPartId: SHIFT_DESIGN_PARTS.homeTemplate.id,
  name: "Cinematic Home",
  note: "Template",
  surface: true,
  render: () => (
    <ShiftCinematicHome games={SHIFT_CINEMATIC_GAMES} time="4:24 PM" />
  ),
}
