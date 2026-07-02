/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Filter & sort overlay (static). Composes ScreenShell + FilterSortPanel.
 */
import { Title } from "../../ui/atoms/Title"
import { FilterSortPanel } from "../../ui/organisms/FilterSortPanel"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function FilterSort() {
  return (
    <ScreenShell
      title="PICO ▸ FILTER & SORT"
      hints={[
        { key: "a", label: "APPLY" },
        { key: "b", label: "CANCEL" },
      ]}
    >
      <Title size={0}>FILTER & SORT</Title>
      <FilterSortPanel />
    </ScreenShell>
  )
}
