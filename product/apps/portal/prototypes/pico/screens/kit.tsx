/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Shared presentational kit for the max-out state gallery. Every gallery screen
 * composes from these so the 8-bit language stays consistent across ~70 states
 * without each screen re-deriving chrome, lists, modals, bars, etc.
 *
 * RULES (match the prototype's bounded-intrinsic token system):
 *  - Sizing comes from the token scale: text via --pico-text-* (classes own
 *    font-size), space via --pico-space-*. NEVER set font-size inline (an inline
 *    style beats the class and breaks the device-lab TEXT scaling) and NEVER use
 *    a raw runaway cqh/cqw on a leaf — big art uses min(<cqh>, calc(base * N)).
 *  - Selection / focus highlights live in CSS classes (.sel / .focused), never
 *    inline style.
 *  - All classes are scoped under [data-pico]; shared atoms use the `pc-` prefix.
 */
import type { ReactNode } from "react"
import type { PicoPlayer } from "../fixtures-extra"
import { PicoArtImage } from "../PicoArtImage"
import { PicoIcon } from "../PicoIcon"
import { PicoMascot } from "../PicoMascot"
import { PicoButtonBar } from "../PicoStatusBar"
import type { Hint } from "../ui/templates/ScreenShell"

export { PicoArtImage } from "../PicoArtImage"
export { PicoCart } from "../PicoCart"
export { PicoIcon } from "../PicoIcon"
export { PicoMascot } from "../PicoMascot"
// Migrated to the atomic-design layers; re-exported so the not-yet-migrated
// screens keep importing `Screen` / `Title` from the kit unchanged.
export { Title } from "../ui/atoms/Title"
export { ScreenShell as Screen } from "../ui/templates/ScreenShell"

export function Sub({ children }: { readonly children: ReactNode }) {
  return <div className="pc-sub">{children}</div>
}

export function Dim({ children }: { readonly children: ReactNode }) {
  return <span className="pc-dim">{children}</span>
}

/** Action button. Visual only. */
export function Btn({
  children,
  kind,
  sel,
}: {
  readonly children: ReactNode
  readonly kind?: "primary" | "danger" | "ghost"
  readonly sel?: boolean
}) {
  return (
    <span className={`pc-btn ${kind ?? ""} ${sel ? "sel" : ""}`}>
      {children}
    </span>
  )
}

/** A selectable list. Pass rows; mark the selected one. */
export function List({ children }: { readonly children: ReactNode }) {
  return <div className="pc-list">{children}</div>
}

export function Row({
  icon,
  label,
  meta,
  trailing,
  sel,
}: {
  readonly icon?: ReactNode
  readonly label: ReactNode
  readonly meta?: ReactNode
  readonly trailing?: ReactNode
  readonly sel?: boolean
}) {
  return (
    <div className={`pc-row ${sel ? "sel" : ""}`}>
      {icon !== undefined ? <span className="pc-row-ico">{icon}</span> : null}
      <span className="pc-row-text">
        <span className="pc-row-label">{label}</span>
        {meta !== undefined ? (
          <span className="pc-row-meta">{meta}</span>
        ) : null}
      </span>
      {trailing !== undefined ? (
        <span className="pc-row-trail">{trailing}</span>
      ) : null}
    </div>
  )
}

/** A bordered panel card. */
export function Card({
  title,
  children,
  className,
}: {
  readonly title?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <div className={`pc-card ${className ?? ""}`}>
      {title !== undefined ? (
        <div className="pc-card-title">{title}</div>
      ) : null}
      {children}
    </div>
  )
}

/** A centered modal / sheet over a dimmed game backdrop. */
export function Modal({
  title,
  children,
  hints,
}: {
  readonly title?: ReactNode
  readonly children: ReactNode
  readonly hints?: readonly Hint[]
}) {
  return (
    <div className="pc-root">
      <div className="pc-gamebg" />
      <div className="pc-modal">
        <div className="pc-modal-panel">
          {title !== undefined ? (
            <div className="pc-modal-title">{title}</div>
          ) : null}
          {children}
        </div>
      </div>
      {hints ? <PicoButtonBar hints={hints} /> : null}
    </div>
  )
}

/** A determinate progress bar (0..100). Width is the only inline style (layout,
 * not type), which is allowed. */
export function Progress({ pct }: { readonly pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="pc-progress">
      <div className="pc-progress-fill" style={{ width: `${clamped}%` }} />
    </div>
  )
}

/** Chunky block slider (▓░ run) like Variant B. */
export function BlockBar({
  level,
  max,
}: {
  readonly level: number
  readonly max: number
}) {
  return (
    <span className="pc-bar">
      <span className="pc-bar-on">{"█".repeat(Math.max(0, level))}</span>
      <span className="pc-bar-off">{"░".repeat(Math.max(0, max - level))}</span>
    </span>
  )
}

/** Two-segment ON/OFF toggle. */
export function Toggle({ on }: { readonly on: boolean }) {
  return (
    <span className="pc-toggle">
      <span className={on ? "on" : ""}>ON</span>
      <span className={on ? "" : "on"}>OFF</span>
    </span>
  )
}

/** Option cycler ◂ VALUE ▸. */
export function Opt({ value }: { readonly value: ReactNode }) {
  return (
    <span className="pc-opt">
      <PicoIcon name="back" className="pc-opt-arr" />
      {value}
      <PicoIcon name="play" className="pc-opt-arr" />
    </span>
  )
}

/** Horizontal tab strip. */
export function Tabs({
  items,
  sel,
}: {
  readonly items: readonly string[]
  readonly sel: number
}) {
  return (
    <div className="pc-tabs">
      {items.map((item, index) => (
        <span key={item} className={`pc-tab ${index === sel ? "sel" : ""}`}>
          {item}
        </span>
      ))}
    </div>
  )
}

/** A labelled stat readout. */
export function Stat({
  label,
  value,
}: {
  readonly label: ReactNode
  readonly value: ReactNode
}) {
  return (
    <span className="pc-stat">
      <b>{value}</b>
      {label}
    </span>
  )
}

export function Badge({
  children,
  tone,
}: {
  readonly children: ReactNode
  readonly tone?: "accent" | "good" | "bad" | "info"
}) {
  return <span className={`pc-badge ${tone ?? ""}`}>{children}</span>
}

export function Chip({ children }: { readonly children: ReactNode }) {
  return <span className="pc-chip">{children}</span>
}

/** Animated 8-bit spinner (three blinking blocks). */
export function Spinner() {
  return (
    <span className="pc-spinner" aria-hidden>
      <b />
      <b />
      <b />
    </span>
  )
}

/** A big centered status glyph (e.g. ⚠ ✓ ✕ ⏻). */
export function Glyph({
  children,
  tone,
}: {
  readonly children: ReactNode
  readonly tone?: "accent" | "good" | "bad" | "info"
}) {
  return <div className={`pc-glyph ${tone ?? ""}`}>{children}</div>
}

/** Player chip with a swappable representation. The four reps let us compare
 * how players should read on screen (recolored Pixl / seat tag / avatar / pad). */
export type PlayerRep = "mascot" | "tag" | "avatar" | "pad"

const PLAYER_SUB: Record<PicoPlayer["status"], string> = {
  host: "HOST",
  ready: "READY",
  joining: "JOINING…",
  open: "PRESS START",
}

function playerMark(player: PicoPlayer, rep: PlayerRep): ReactNode {
  if (player.status === "open") return <span className="pcPlayer-open">+</span>
  if (rep === "tag") return <span className="pcPlayer-tag">P{player.seat}</span>
  if (rep === "pad") return <PicoIcon name="pad" className="pcPlayer-pad" />
  if (rep === "avatar") {
    return player.avatar ? (
      <PicoArtImage src={player.avatar} ratio={1} className="pcPlayer-av" />
    ) : (
      <span className="pcPlayer-tag">P{player.seat}</span>
    )
  }
  return (
    <PicoMascot
      className="pcPlayer-pixl"
      state={player.status === "ready" ? "happy" : "idle"}
    />
  )
}

export function Player({
  player,
  rep = "mascot",
}: {
  readonly player: PicoPlayer
  readonly rep?: PlayerRep
}) {
  return (
    <span className={`pcPlayer p${player.seat} ${player.status}`}>
      <span className="pcPlayer-mark">{playerMark(player, rep)}</span>
      <span className="pcPlayer-name">
        {player.status === "open" ? "OPEN" : player.name}
      </span>
      <span className="pcPlayer-sub">{PLAYER_SUB[player.status]}</span>
    </span>
  )
}

/** Centered hero state: glyph + title + message + actions. Reused by most
 * loading / error / empty / confirm screens. */
export function Hero({
  glyph,
  glyphTone,
  title,
  message,
  spinner,
  children,
}: {
  readonly glyph?: ReactNode
  readonly glyphTone?: "accent" | "good" | "bad" | "info"
  readonly title: ReactNode
  readonly message?: ReactNode
  readonly spinner?: boolean
  readonly children?: ReactNode
}) {
  return (
    <div className="pc-hero">
      {glyph !== undefined ? <Glyph tone={glyphTone}>{glyph}</Glyph> : null}
      {spinner ? <Spinner /> : null}
      <Title size={1}>{title}</Title>
      {message !== undefined ? <p className="pc-hero-msg">{message}</p> : null}
      {children !== undefined ? (
        <div className="pc-hero-actions">{children}</div>
      ) : null}
    </div>
  )
}
