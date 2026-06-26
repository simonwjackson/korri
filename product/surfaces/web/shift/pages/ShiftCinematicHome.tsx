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
import { AnimatePresence, motion } from "framer-motion"
import { BatteryMedium, Wifi } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { launchStatusView } from "../launch-failure-copy"

export interface ShiftCinematicGame {
  readonly id: string
  readonly title: string
  readonly tileArtUrl: string
  readonly wideArtUrl: string
  readonly genre?: string
  readonly developer?: string
  readonly lastPlayedLabel?: string
  readonly playtimeLabel?: string
  readonly favorite?: boolean
}

export interface ShiftCinematicHomeProps {
  readonly games: readonly ShiftCinematicGame[]
  readonly time?: string
  readonly avatarSrc?: string
  /** Launch the focused game. The real host wires this to the launch
   * controller; the standalone prototype omits it (focus-only). */
  readonly onLaunch?: (gameId: string) => void
  /** Live launch lifecycle for the in-scene feedback. Omit/Idle = normal hero. */
  readonly launchState?: LaunchState
  /** Retry the failed launch (A while a failure is shown). */
  readonly onRetry?: () => void
  /** Dismiss the launch feedback and return to browsing (B). */
  readonly onDismiss?: () => void
}

const SPRING = { type: "spring", stiffness: 260, damping: 32 } as const

export function ShiftCinematicHome({
  games,
  time = "4:24 PM",
  avatarSrc,
  onLaunch,
  launchState,
  onRetry,
  onDismiss,
}: ShiftCinematicHomeProps) {
  const [index, setIndex] = useState(0)
  const [trackX, setTrackX] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const game = games[index]

  // The scene reacts to the launch lifecycle in place — no modal. When a status
  // is showing, the hero + legend morph and the buttons remap (A = Retry / B =
  // Back); otherwise A launches the focused game.
  const status = useMemo(() => launchStatusView(launchState), [launchState])
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

  return (
    <div
      data-shift-home
      className="shift-cine intrinsic relative h-full w-full overflow-hidden"
    >
      {/* Full-bleed art environment — crossfades + parallax-scales on focus. */}
      <AnimatePresence>
        <motion.div
          key={game.id}
          className="shift-cine-bg"
          data-cooled={status?.tone === "failed" || undefined}
          style={{ backgroundImage: `url(${game.wideArtUrl})` }}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </AnimatePresence>
      <div className="shift-cine-scrim" />

      <header className="shift-cine-top">
        <span className="shift-cine-clock">{time}</span>
        <span className="shift-cine-status">
          <Wifi className="shift-cine-status-icon" aria-hidden />
          <BatteryMedium className="shift-cine-status-icon" aria-hidden />
          {avatarSrc ? (
            <img className="shift-cine-avatar" src={avatarSrc} alt="" />
          ) : null}
        </span>
      </header>

      <div className="shift-cine-stage" ref={stageRef}>
        <div className="shift-cine-midrow">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${game.id}:${status?.tone ?? "live"}`}
              className="shift-cine-hero"
              role={status ? "status" : undefined}
              aria-live={
                status?.tone === "failed"
                  ? "assertive"
                  : status
                    ? "polite"
                    : undefined
              }
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
            >
              {status ? (
                <>
                  <span className="shift-cine-kicker" data-tone={status.tone}>
                    {status.kicker}
                  </span>
                  <h1 className="shift-cine-title">{game.title}</h1>
                  {status.tone === "launching" ? (
                    <div className="shift-cine-loading" aria-hidden />
                  ) : status.reason ? (
                    <div className="shift-cine-chips">
                      <span className="shift-cine-chip is-reason">
                        {status.reason}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="shift-cine-kicker">
                    {resuming ? "Continue playing" : "Ready to play"}
                  </span>
                  <h1 className="shift-cine-title">{game.title}</h1>
                  {/* Glanceable single row — full metadata lives on Game Detail. */}
                  <div className="shift-cine-chips">
                    {game.genre ? (
                      <span className="shift-cine-chip">{game.genre}</span>
                    ) : null}
                    {game.developer ? (
                      <span className="shift-cine-chip">{game.developer}</span>
                    ) : null}
                    {game.lastPlayedLabel ? (
                      <span className="shift-cine-chip">
                        {game.lastPlayedLabel}
                      </span>
                    ) : null}
                    {game.playtimeLabel ? (
                      <span className="shift-cine-chip">
                        {game.playtimeLabel}
                      </span>
                    ) : null}
                    {game.favorite ? (
                      <span className="shift-cine-chip is-fav">★ Favorite</span>
                    ) : null}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Button hints — their own right-aligned row above the rail, so they
            never compete with the hero's chips for one line. */}
        {status ? (
          showActions ? (
            <div className="shift-cine-legend">
              {status.canRetry ? (
                <CineHint glyph="A" label="Retry" primary />
              ) : null}
              <CineHint glyph="B" label="Back" primary={!status.canRetry} />
            </div>
          ) : null
        ) : (
          <div className="shift-cine-legend">
            <CineHint
              glyph="A"
              label={resuming ? "Continue" : "Play"}
              primary
            />
            <CineHint glyph="X" label="Options" />
            <CineHint glyph="Y" label="Favorite" />
          </div>
        )}

        <div className="shift-cine-rail">
          <motion.div
            className="shift-cine-track"
            ref={trackRef}
            animate={{ x: trackX }}
            transition={SPRING}
          >
            {games.map((entry, i) => (
              <button
                type="button"
                key={entry.id}
                data-cine-index={i}
                data-focused={i === index || undefined}
                className="shift-cine-tile"
                aria-label={entry.title}
                onFocus={() => setIndex(i)}
                onClick={() => activate(i)}
              >
                <img src={entry.tileArtUrl} alt="" loading="lazy" />
              </button>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function CineHint({
  glyph,
  label,
  primary,
}: {
  readonly glyph: string
  readonly label: string
  readonly primary?: boolean
}) {
  return (
    <span className="shift-cine-hint" data-primary={primary || undefined}>
      <span className="shift-cine-hint-glyph" aria-hidden>
        {glyph}
      </span>
      <span>{label}</span>
    </span>
  )
}
