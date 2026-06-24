/**
 * Seed-proof — Home route. The REAL Shift home composition, but the rail's
 * onItemClick navigates to the Game Detail route instead of launching. Reads
 * the seeded catalog atom (same path production uses).
 */
import { useAtomValue } from "@effect/atom-react"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import {
  ShiftCatalogStateRoot,
  useShiftCatalogCase,
} from "@product/surfaces/web/shift/catalog/ShiftCatalogStateRoot"
import { ShiftHomeCaption } from "@product/surfaces/web/shift/molecules/ShiftHomeCaption"
import { ShiftHomeBottomBar } from "@product/surfaces/web/shift/organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "@product/surfaces/web/shift/organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "@product/surfaces/web/shift/organisms/ShiftHomeTopBar"
import { ShiftHomeLoadingBody } from "@product/surfaces/web/shift/pages/ShiftHomeLoadingBody"
import { ShiftHomeRoot } from "@product/surfaces/web/shift/templates/ShiftHomeRoot"
import { useNavigate } from "@tanstack/react-router"
import { Option } from "effect"

const AVATAR = "https://i.pravatar.cc/96?u=korri-shift-user"

export function Home() {
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
