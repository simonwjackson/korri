/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Collections list (static demo data). Composes ScreenShell + CollectionList.
 */
import { Title } from "../../ui/atoms/Title"
import {
  type Collection,
  CollectionList,
} from "../../ui/organisms/CollectionList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

const COLLECTIONS: readonly Collection[] = [
  { name: "FAVORITES", count: 12 },
  { name: "RECENTLY ADDED", count: 24 },
  { name: "CO-OP NIGHT", count: 8 },
  { name: "SPEEDRUN", count: 15 },
  { name: "HIDDEN GEMS", count: 6 },
]

export function Collections() {
  return (
    <ScreenShell
      title="PICO ▸ COLLECTIONS"
      hints={[
        { key: "a", label: "OPEN" },
        { key: "y", label: "NEW" },
      ]}
    >
      <Title size={0}>COLLECTIONS</Title>
      <CollectionList collections={COLLECTIONS} />
    </ScreenShell>
  )
}
