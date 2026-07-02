/**
 * Detail Split template catalog entry — the game-detail LAYOUT (key art beside
 * the info column) around a `game` slot. The Game Detail *page*
 * (`ShiftGameDetail.page.part`) binds a specific game and its action states;
 * here it renders from a fixture as a pure layout.
 */
import { ShiftDetailSplit } from "./pages/ShiftDetailSplit"
import { SHIFT_DETAIL_PLAYED } from "./pages/shift-detail-fixtures"
import { SHIFT_DESIGN_PARTS } from "./shift-design-parts"

export default {
  designPartId: SHIFT_DESIGN_PARTS.detailTemplate.id,
  name: "Detail Split",
  note: "Template",
  surface: true,
  render: () => <ShiftDetailSplit game={SHIFT_DETAIL_PLAYED} />,
}
