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
 * Interactive in the lab: ←/→ (or click a tile) moves focus. useInputAction is
 * intentionally not used here so the prototype is self-contained; the shipping
 * version would subscribe to semantic `direction`/`confirm` actions instead.
 */
import { AnimatePresence, motion } from "framer-motion"
import { BatteryMedium, Wifi } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

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
}

const SPRING = { type: "spring", stiffness: 260, damping: 32 } as const

export function ShiftCinematicHome({
  games,
  time = "4:24 PM",
  avatarSrc,
}: ShiftCinematicHomeProps) {
  const [index, setIndex] = useState(0)
  const [trackX, setTrackX] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const game = games[index]

  const move = useCallback(
    (delta: number) => {
      setIndex(i => (i + delta + games.length) % games.length)
    },
    [games.length],
  )

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault()
        move(1)
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        move(-1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [move])

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
              key={game.id}
              className="shift-cine-hero"
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
            >
              <span className="shift-cine-kicker">
                {resuming ? "Continue playing" : "Ready to play"}
              </span>
              <h1 className="shift-cine-title">{game.title}</h1>
              {/* Glanceable single row — full metadata lives on Game Detail. */}
              <div className="shift-cine-chips">
                {game.genre ? (
                  <span className="shift-cine-chip">{game.genre}</span>
                ) : null}
                {game.lastPlayedLabel ? (
                  <span className="shift-cine-chip">
                    {game.lastPlayedLabel}
                  </span>
                ) : null}
                {game.favorite ? (
                  <span className="shift-cine-chip is-fav">★ Favorite</span>
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="shift-cine-legend">
            <CineHint
              glyph="A"
              label={resuming ? "Continue" : "Play"}
              primary
            />
            <CineHint glyph="X" label="Options" />
            <CineHint glyph="Y" label="Favorite" />
          </div>
        </div>

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
                onClick={() => setIndex(i)}
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
