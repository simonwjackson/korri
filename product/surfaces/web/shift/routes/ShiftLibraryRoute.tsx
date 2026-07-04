/**
 * Shift library route — the Lens variant bound to the real catalog.
 *
 * Mirrors ShiftGameDetailRoute: reads the live catalog snapshot, renders every
 * data state through the shared ShiftCatalogState machine, and projects the
 * Ready entries into the flat library-tile shape the Lens template consumes.
 * This route is the composition root, so it owns the catalog → library-game
 * mapping (including the userData/playStats fields the base projection leaves to
 * the caller). Selecting a tile opens its detail; the semantic `back` (East)
 * pops history, which returns to the home the user came from.
 */
import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
} from "@platform/library/playable-library-ui"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import { Option } from "effect"
import type { ComponentProps } from "react"
import type { ShiftLibraryLens as LibraryLens } from "../pages/ShiftLensRow"
import {
  ShiftCatalogStateRoot,
  useShiftCatalogCase,
} from "../catalog/ShiftCatalogStateRoot"
import { ShiftHomeDefectBody } from "../pages/ShiftHomeDefectBody"
import { ShiftHomeEmptyBody } from "../pages/ShiftHomeEmptyBody"
import { ShiftHomeLoadErrorBody } from "../pages/ShiftHomeLoadErrorBody"
import { ShiftHomeLoadingBody } from "../pages/ShiftHomeLoadingBody"
import { ShiftLibraryLens } from "../pages/ShiftLibraryLens"
import type { ShiftLibraryGame } from "../pages/shift-library-game"

const noop = () => {}

/**
 * The composition root's catalog → library-tile projection: title/art from the
 * shared playable helpers (same portrait art the detail route uses), plus the
 * sortable/filterable user data (favourite, last-played epoch ms, playtime
 * minutes) the Lens controls read.
 */
export function shiftLibraryGameFromCatalog(
  entry: CatalogEntry,
): ShiftLibraryGame {
  const genre = entry.metadata?.genre?.[0]
  const developer = entry.metadata?.developer
  const favorite = entry.userData?.favorite === true
  const lastPlayed = entry.playStats?.lastPlayed
  const playtimeSeconds = entry.playStats?.totalPlaytimeSeconds
  return {
    id: entry.id,
    title: getPlayableDisplayName(entry),
    artUrl: getPlayableImageUrl(entry) ?? "",
    ...(genre ? { genre } : {}),
    ...(developer ? { developer } : {}),
    ...(favorite ? { favorite: true } : {}),
    ...(lastPlayed ? { lastPlayedAt: new Date(lastPlayed).getTime() } : {}),
    ...(playtimeSeconds !== undefined
      ? { playtimeMinutes: Math.round(playtimeSeconds / 60) }
      : {}),
  }
}

/**
 * The library's full data-state composition, seedable by `result` so any host
 * (the live route or a test) can drive it through Loading / LoadError / Defect /
 * Empty / Ready without a backend.
 */
export function ShiftLibraryStateView({
  result,
  onSelect,
  onBack,
  onRetry,
  lens,
  onLensChange,
}: {
  readonly result: ComponentProps<typeof ShiftCatalogStateRoot>["result"]
  readonly onSelect?: (id: string) => void
  readonly onBack?: () => void
  readonly onRetry?: () => void
  readonly lens?: LibraryLens
  readonly onLensChange?: (lens: LibraryLens) => void
}) {
  return (
    <ShiftCatalogStateRoot result={result}>
      <ShiftHomeLoadingBody />
      <ShiftHomeLoadErrorBody onRetry={onRetry ?? noop} />
      <ShiftHomeDefectBody />
      <ShiftHomeEmptyBody />
      <LibraryReadyBody
        onSelect={onSelect}
        onBack={onBack}
        lens={lens}
        onLensChange={onLensChange}
      />
    </ShiftCatalogStateRoot>
  )
}

function LibraryReadyBody({
  onSelect,
  onBack,
  lens,
  onLensChange,
}: {
  readonly onSelect?: (id: string) => void
  readonly onBack?: () => void
  readonly lens?: LibraryLens
  readonly onLensChange?: (lens: LibraryLens) => void
}) {
  const ready = useShiftCatalogCase("Ready")
  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) => (
      <ShiftLibraryLens
        games={games.map(shiftLibraryGameFromCatalog)}
        onSelect={onSelect}
        onBack={onBack}
        lens={lens}
        onLensChange={onLensChange}
      />
    ),
  })
}

export function ShiftLibraryRoute() {
  const live = useAtomValue(catalogSnapshotAtom)
  const refreshSnapshot = useAtomRefresh(catalogSnapshotAtom)
  const navigate = useNavigate()
  const router = useRouter()
  // SPIKE: read `lens` from typed URL search; changing it navigates search.
  const search = useSearch({ strict: false }) as { readonly lens?: LibraryLens }
  const lens = search.lens ?? "all"
  return (
    <ShiftLibraryStateView
      result={live}
      onRetry={refreshSnapshot}
      lens={lens}
      onLensChange={next =>
        navigate({ to: "/library", search: { lens: next } })
      }
      onSelect={id => navigate({ to: "/game/$id", params: { id } })}
      onBack={() => router.history.back()}
    />
  )
}
