/**
 * Seed-proof — Game Detail route. Reads the focused game from the SAME seeded
 * catalog atom by route param, maps it to the Shift detail view, and renders the
 * real ShiftGameDetailScreen. Esc / Backspace navigates back to the home.
 */
import { useAtomValue } from "@effect/atom-react"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
} from "@platform/library/playable-library-ui"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import {
  ShiftCatalogStateRoot,
  useShiftCatalogCase,
} from "@product/surfaces/web/shift/catalog/ShiftCatalogStateRoot"
import { ShiftGameDetailScreen } from "@product/surfaces/web/shift/pages/ShiftGameDetailScreen"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Option } from "effect"
import { useEffect } from "react"

export function Detail() {
  const snapshot = useAtomValue(catalogSnapshotAtom)
  return (
    <ShiftCatalogStateRoot result={snapshot}>
      <DetailReadyBody />
    </ShiftCatalogStateRoot>
  )
}

function DetailReadyBody() {
  const ready = useShiftCatalogCase("Ready")
  const params = useParams({ strict: false })
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault()
        navigate({ to: "/" })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navigate])

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) => {
      const entry = games.find(game => game.id === params.id)
      if (!entry) return null
      return (
        <ShiftGameDetailScreen
          games={[
            {
              id: entry.id,
              title: getPlayableDisplayName(entry),
              artUrl: getPlayableImageUrl(entry) ?? "",
            },
          ]}
        />
      )
    },
  })
}
