import { useAtomValue } from "@effect/atom-react"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useNavigate } from "@tanstack/react-router"
import { Option } from "effect"
import {
  ShiftCatalogStateRoot,
  useShiftCatalogCase,
} from "../catalog/ShiftCatalogStateRoot"
import { ShiftHomeCaption } from "../molecules/ShiftHomeCaption"
import { ShiftHomeBottomBar } from "../organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "../organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "../organisms/ShiftHomeTopBar"
import { ShiftHomeLoadingBody } from "../pages/ShiftHomeLoadingBody"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"

const AVATAR = "https://i.pravatar.cc/96?u=korri-shift-user"

export function ShiftHomeRoute() {
  const snapshot = useAtomValue(catalogSnapshotAtom)
  return (
    <div data-shift-home-frame>
      <ShiftCatalogStateRoot result={snapshot}>
        <ShiftHomeLoadingBody />
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
        <ShiftHomeRoot items={games}>
          <ShiftHomeTopBar time="4:24 PM" avatarSrc={AVATAR} />
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-[var(--shift-space-1)]">
            <ShiftHomeRail
              onItemClick={game =>
                navigate({ to: "/game/$id", params: { id: game.id } })
              }
            />
            <ShiftHomeCaption />
          </div>
          <ShiftHomeBottomBar />
        </ShiftHomeRoot>
      ) : null,
  })
}
