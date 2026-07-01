/**
 * Shift prototype — Cinematic Rail home.
 *
 * A device-first take on the Switch home: not a page with content poured into
 * it, but a SCENE. The focused game's art fills the screen edge-to-edge and
 * becomes the environment; a spring-driven rail keeps the focused tile centered
 * (the rail moves under a fixed center, Switch-style); moving focus crossfades
 * the whole-screen art and springs the hero copy in. Metadata is glanceable
 * chips, never prose, and the bottom legend maps physical buttons.
 *
 * Input is device-agnostic and DOM-focus-driven. Tiles are native focusable
 * <button>s; the platform focus engine — fed by every adapter (keyboard,
 * gamepad, and the desktop/input-plumber bridge) — moves real DOM focus between
 * them, and the scene follows focus (onFocus updates the centered index, which
 * drives the art crossfade + hero). Confirm is the focus engine clicking the
 * focused tile (→ its onClick); only the semantic `back` is consumed directly
 * via useInputAction. No raw key handling and no per-component directional
 * wiring, so adding an input device is free and none can be silently dropped.
 */
import type { LaunchState } from "@platform/library/launch-state"
import { useInputAction } from "@platform/react/input/use-input-action"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { launchStatusView } from "../launch-failure-copy"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftCineBackdrop } from "../ui/molecules/ShiftCineBackdrop"
import {
  type ShiftCineHintSpec,
  ShiftCineLegend,
} from "../ui/molecules/ShiftCineLegend"
import {
  ShiftStatusBar,
  type ShiftStatusBarProps,
} from "../ui/molecules/ShiftStatusBar"
import { ShiftCineHero } from "../ui/organisms/ShiftCineHero"
import { ShiftCineRail } from "../ui/organisms/ShiftCineRail"

export interface ShiftCinematicGame {
  readonly id: string
  readonly title: string
  readonly tileArtUrl: string
  readonly tileArtAspectRatio?: string
  readonly wideArtUrl: string
  readonly genre?: string
  readonly developer?: string
  readonly lastPlayedLabel?: string
  readonly playtimeLabel?: string
  readonly favorite?: boolean
}

export interface ShiftImageWindow {
  readonly start: number
  readonly end: number
}

const TILE_IMAGE_RADIUS = 9
const TILE_PRELOAD_RADIUS = 12
const BACKDROP_PRELOAD_RADIUS = 2

export function shiftImageWindow({
  index,
  total,
  radius,
}: {
  readonly index: number
  readonly total: number
  readonly radius: number
}): ShiftImageWindow {
  if (total <= 0) return { start: 0, end: -1 }
  return {
    start: Math.max(0, index - radius),
    end: Math.min(total - 1, index + radius),
  }
}

export function shiftPreloadImageUrls(
  games: readonly ShiftCinematicGame[],
  index: number,
): readonly string[] {
  const tileWindow = shiftImageWindow({
    index,
    total: games.length,
    radius: TILE_PRELOAD_RADIUS,
  })
  const backdropWindow = shiftImageWindow({
    index,
    total: games.length,
    radius: BACKDROP_PRELOAD_RADIUS,
  })
  const urls = new Set<string>()
  for (let i = tileWindow.start; i <= tileWindow.end; i++) {
    const url = games[i]?.tileArtUrl
    if (url) urls.add(url)
  }
  for (let i = backdropWindow.start; i <= backdropWindow.end; i++) {
    const url = games[i]?.wideArtUrl
    if (url) urls.add(url)
  }
  return Array.from(urls)
}

export interface ShiftCinematicHomeProps {
  readonly games: readonly ShiftCinematicGame[]
  readonly time?: string
  readonly avatarSrc?: string
  /** Status-bar battery state; defaults to a mid-charge battery. */
  readonly battery?: ShiftStatusBarProps["battery"]
  /** Status-bar network state; defaults to connected. */
  readonly network?: ShiftStatusBarProps["network"]
  /** Publish the focused game. Dual-screen hosts wire this to the shared
   * session; standalone prototype usage omits it (focus-only). */
  readonly onGameFocus?: (gameId: string) => void
  /** Launch the focused game. The real host wires this to the launch
   * controller; the standalone prototype omits it (focus-only). */
  readonly onLaunch?: (gameId: string) => void
  /** Local launch-request feedback. Omit/Idle/Accepted = normal hero unless the foreground session is running. */
  readonly launchState?: LaunchState
  /** Authoritative foreground-session state; Running owns the Now Playing presentation. */
  readonly foregroundState?: ForegroundSessionGateState
  /** Retry the failed launch (A while a failure is shown). */
  readonly onRetry?: () => void
  /** Dismiss the launch feedback and return to browsing (B). */
  readonly onDismiss?: () => void
}

export function ShiftCinematicHome({
  games,
  time = "4:24 PM",
  avatarSrc,
  battery,
  network,
  onGameFocus,
  onLaunch,
  launchState,
  foregroundState,
  onRetry,
  onDismiss,
}: ShiftCinematicHomeProps) {
  const [index, setIndex] = useState(0)
  const [trackX, setTrackX] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const preloadedImageUrlsRef = useRef<Set<string>>(new Set())
  const game = games[index]
  const gameId = game?.id
  const [backdropArtUrl, setBackdropArtUrl] = useState(
    () => game?.wideArtUrl ?? "",
  )
  const tileImageWindow = useMemo(
    () =>
      shiftImageWindow({
        index,
        total: games.length,
        radius: TILE_IMAGE_RADIUS,
      }),
    [index, games.length],
  )
  const preloadImageUrls = useMemo(
    () => shiftPreloadImageUrls(games, index),
    [games, index],
  )

  useEffect(() => {
    if (gameId) onGameFocus?.(gameId)
  }, [gameId, onGameFocus])

  useEffect(() => {
    if (typeof Image === "undefined") return
    for (const url of preloadImageUrls) {
      if (preloadedImageUrlsRef.current.has(url)) continue
      preloadedImageUrlsRef.current.add(url)
      const image = new Image()
      image.decoding = "async"
      image.src = url
      void image.decode?.().catch(() => undefined)
    }
  }, [preloadImageUrls])

  useEffect(() => {
    const nextArtUrl = game?.wideArtUrl ?? ""
    if (!nextArtUrl) {
      setBackdropArtUrl("")
      return
    }
    if (nextArtUrl === backdropArtUrl) return
    if (typeof Image === "undefined") {
      setBackdropArtUrl(nextArtUrl)
      return
    }

    let cancelled = false
    const image = new Image()
    image.decoding = "async"
    const commit = () => {
      if (!cancelled) setBackdropArtUrl(nextArtUrl)
    }
    image.onload = commit
    image.onerror = commit
    image.src = nextArtUrl
    if (image.complete) commit()
    else if (image.decode) void image.decode().then(commit, commit)
    return () => {
      cancelled = true
    }
  }, [game?.wideArtUrl, backdropArtUrl])

  // The scene reacts to the launch lifecycle in place — no modal. When a status
  // is showing, the hero + legend morph and the buttons remap (A = Retry / B =
  // Back); otherwise A launches the focused game.
  const status = useMemo(
    () => launchStatusView(launchState, foregroundState),
    [launchState, foregroundState],
  )
  const showActions =
    status?.tone === "failed" || status?.tone === "unavailable"

  const confirm = useCallback(() => {
    if (status) {
      if (status.canRetry) onRetry?.()
      return
    }
    const focused = games[index]
    if (focused) onLaunch?.(focused.id)
  }, [status, onRetry, games, index, onLaunch])

  const dismiss = useCallback(() => {
    if (showActions) onDismiss?.()
  }, [showActions, onDismiss])

  // Activating a tile: confirm it when it's already the focused (centered) one,
  // otherwise bring it to focus. Mirrors the legend's "A".
  const activate = useCallback(
    (target: number) => {
      if (status) {
        confirm()
        return
      }
      if (target === index) confirm()
      else setIndex(target)
    },
    [status, index, confirm],
  )

  // `back` is a semantic action (not a focus move or a click), so the component
  // consumes it directly. `confirm` is intentionally NOT subscribed here: the
  // focus engine maps confirm to a click on the focused tile, which already runs
  // the tile's onClick → launch/retry, so subscribing would double-fire it.
  // No-op when no input system is running (standalone fixture render).
  useInputAction("back", dismiss)

  // Keep the focused tile centered: shift the whole track so the active tile's
  // center lands at the stage center (the cursor is fixed, the rail moves).
  useEffect(() => {
    const recenter = () => {
      const track = trackRef.current
      const stage = stageRef.current
      if (!track || !stage) return
      const tile = track.querySelector<HTMLElement>(
        `[data-cine-index="${index}"]`,
      )
      if (!tile) return
      setTrackX(
        stage.clientWidth / 2 - (tile.offsetLeft + tile.offsetWidth / 2),
      )
    }
    recenter()
    window.addEventListener("resize", recenter)
    return () => window.removeEventListener("resize", recenter)
  }, [index])

  // Seed focus on the active tile at mount so the focus engine has a starting
  // point and confirm works immediately. Skipped when focus already lives
  // somewhere meaningful, so we never yank it from the host or the user.
  useEffect(() => {
    const active = document.activeElement
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement
    )
      return
    trackRef.current
      ?.querySelector<HTMLElement>('[data-cine-index="0"]')
      ?.focus({ preventScroll: true })
  }, [])

  if (!game) return null
  const resuming = Boolean(game.lastPlayedLabel)

  // The legend's hint set changes with launch state: browsing shows
  // Play/Options/Favorite; a shown failure shows Retry/Back; a non-actionable
  // status (launching/launched) shows none.
  const legendHints: readonly ShiftCineHintSpec[] | null = status
    ? showActions
      ? [
          ...(status.canRetry
            ? [{ glyph: "A", label: "Retry", primary: true }]
            : []),
          { glyph: "B", label: "Back", primary: !status.canRetry },
        ]
      : null
    : [
        { glyph: "A", label: resuming ? "Continue" : "Play", primary: true },
        { glyph: "X", label: "Options" },
        { glyph: "Y", label: "Favorite" },
      ]

  return (
    <div
      data-shift-home
      className="shift-cine intrinsic relative h-full w-full overflow-hidden"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.home)}
    >
      <ShiftCineBackdrop
        artUrl={backdropArtUrl}
        cooled={status?.tone === "failed"}
      />

      <ShiftStatusBar
        time={time}
        avatarSrc={avatarSrc}
        battery={battery}
        network={network}
      />

      <div className="shift-cine-stage" ref={stageRef}>
        <div className="shift-cine-midrow">
          <ShiftCineHero game={game} status={status} resuming={resuming} />
        </div>

        {/* Button hints — their own right-aligned row above the rail, so they
            never compete with the hero's chips for one line. */}
        {legendHints ? <ShiftCineLegend hints={legendHints} /> : null}

        <ShiftCineRail
          games={games}
          index={index}
          trackX={trackX}
          trackRef={trackRef}
          imageWindow={tileImageWindow}
          onTileFocus={setIndex}
          onTileActivate={activate}
        />
      </div>
    </div>
  )
}
