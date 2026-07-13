/**
 * App-level game actions controller.
 *
 * Mounted once at the shell so the command sheet works on every screen that
 * shows a game — not per surface. It listens for the semantic `options` action,
 * reads which game tile is focused (any tile carrying `data-shift-game-id`),
 * resolves it against the live catalog, and opens the sheet for it. Play and
 * Open details are wired to the real launch controller and router; the rest of
 * the catalog renders disabled until its backend lands.
 *
 * The sheet is rendered inside a self-contained, transparent token scope
 * (`data-shift-detail intrinsic`) pinned over the viewport, so it inherits the
 * Shift design tokens and sizing without a route's surface owning it.
 */
import { useAtomValue } from "@effect/atom-react"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useInputAction } from "@platform/react/input/use-input-action"
import { useLibraryLaunchController } from "@platform/react/library/use-library-launch-controller"
import { useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { ShiftCatalogState } from "../catalog/shift-catalog-state"
import { ShiftGameActionsSheet } from "../ui/organisms/ShiftGameActionsSheet"
import { shiftFocusedGameId } from "./shift-focused-game"

export function ShiftGameActionsController() {
  const snapshot = useAtomValue(catalogSnapshotAtom)
  const launch = useLibraryLaunchController()
  const navigate = useNavigate()
  const [gameId, setGameId] = useState<string | null>(null)

  const entries = useMemo(() => {
    const state = ShiftCatalogState.fromResult(snapshot)
    return state._tag === "Ready" ? state.games : []
  }, [snapshot])

  const target = gameId ? entries.find(entry => entry.id === gameId) : undefined

  useInputAction("options", () => {
    const id = shiftFocusedGameId(
      typeof document !== "undefined" ? document.activeElement : null,
    )
    if (id) setGameId(id)
  })

  const close = () => setGameId(null)

  return (
    <div data-shift-detail className="intrinsic shift-game-actions-layer">
      <ShiftGameActionsSheet
        open={target !== undefined}
        gameTitle={target?.title ?? target?.metadata?.name ?? ""}
        state={{
          favorite: target?.userData?.favorite === true,
          played: Boolean(target?.playStats?.lastPlayed),
          running: false,
          releaseCount: 1,
          hasProviderLink: false,
          local: false,
        }}
        handlers={
          target
            ? {
                onPlay: () => {
                  const entry = target
                  close()
                  launch.start(entry)
                },
                onOpenDetails: () => {
                  const id = target.id
                  close()
                  navigate({ to: "/game/$id", params: { id } })
                },
              }
            : {}
        }
        onClose={close}
      />
    </div>
  )
}
