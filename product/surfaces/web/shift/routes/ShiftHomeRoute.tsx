import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
  getPlayableWideImageUrl,
} from "@platform/library/playable-library-ui"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useNavigate } from "@tanstack/react-router"
import { Option } from "effect"
import {
  ShiftCatalogStateRoot,
  useShiftCatalogCase,
} from "../catalog/ShiftCatalogStateRoot"
import {
  ShiftCinematicHome,
  type ShiftCinematicGame,
} from "../pages/ShiftCinematicHome"
import { ShiftHomeDefectBody } from "../pages/ShiftHomeDefectBody"
import { ShiftHomeEmptyBody } from "../pages/ShiftHomeEmptyBody"
import { ShiftHomeLoadErrorBody } from "../pages/ShiftHomeLoadErrorBody"
import { ShiftHomeLoadingBody } from "../pages/ShiftHomeLoadingBody"

const AVATAR = "https://i.pravatar.cc/96?u=korri-shift-user"

export function ShiftHomeRoute() {
  const snapshot = useAtomValue(catalogSnapshotAtom)
  const refreshSnapshot = useAtomRefresh(catalogSnapshotAtom)
  return (
    <div data-shift-home-frame>
      <ShiftCatalogStateRoot result={snapshot}>
        <ShiftHomeLoadingBody />
        <ShiftHomeLoadErrorBody onRetry={refreshSnapshot} />
        <ShiftHomeDefectBody />
        <ShiftHomeEmptyBody />
        <NavigatingReadyBody />
      </ShiftCatalogStateRoot>
    </div>
  )
}

function NavigatingReadyBody() {
  const ready = useShiftCatalogCase("Ready")
  const navigate = useNavigate()

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) =>
      games.length > 0 ? (
        <ShiftCinematicHome
          games={games.map(toCinematicGame)}
          avatarSrc={AVATAR}
          onLaunch={id => navigate({ to: "/game/$id", params: { id } })}
        />
      ) : null,
  })
}

function toCinematicGame(game: CatalogEntry): ShiftCinematicGame {
  const tile = getPlayableImageUrl(game)
  return {
    id: game.id,
    title: getPlayableDisplayName(game),
    tileArtUrl: tile ?? "",
    wideArtUrl: getPlayableWideImageUrl(game) ?? tile ?? "",
  }
}
