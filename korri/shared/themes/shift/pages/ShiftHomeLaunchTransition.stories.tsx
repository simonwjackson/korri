/**
 * Shift theme — launch transition prototypes.
 *
 * Storybook-only design exploration. Each story renders the live Shift home
 * surface and triggers a launch-transition preview shortly after mount (and
 * on confirm / tile click / the Replay button). The four prototypes
 * deliberately use different motion vocabularies so we can compare them
 * side-by-side before promoting one into the real launch flow.
 *
 * Motion is owned by framer-motion (already a project dependency). Each
 * overlay is anchored to the focused tile's measured DOM rect, so the
 * transition has a real origin instead of fading out of nowhere.
 */

import {
  type GameRecord,
  getGameDisplayName,
  getGameImageUrl,
  getGameWideImageUrl,
} from "@shared/fixtures/games/game"
import { games } from "@shared/fixtures/games/games"
import { useInputAction } from "@shared/navigation/use-input-action"
import type { Meta, StoryObj } from "@storybook/react-vite"
import {
  AnimatePresence,
  motion,
  type Transition,
  useReducedMotion,
  type Variants,
} from "framer-motion"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { ShiftHomeCaption } from "../molecules/ShiftHomeCaption"
import { ShiftHomeBottomBar } from "../organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "../organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "../organisms/ShiftHomeTopBar"
import { useShiftHome } from "../templates/ShiftHome.context"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"

const PLACEHOLDER_TIME = "4:24 PM"
const PLACEHOLDER_AVATAR_SRC = "https://i.pravatar.cc/96?u=korri-shift-user"
const DEMO_GAMES = games.slice(0, 10)
const LAUNCH_PREVIEW_MS = 3600

type Prototype = "tile-morph" | "curtain-rise" | "iris-bloom" | "depth-dive"

type LaunchOrigin = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly centerX: number
  readonly centerY: number
}

type LaunchSurfaceSize = { readonly width: number; readonly height: number }

type LaunchEvent = {
  readonly id: number
  readonly game: GameRecord
  readonly origin: LaunchOrigin | null
  readonly surface: LaunchSurfaceSize
}

const meta: Meta = {
  title: "Themes/Shift/Pages/Home Launch Transitions",
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
    viewport: {
      defaultViewport: "fullhd",
      viewports: {
        fullhd: {
          name: "1080p (10ft)",
          styles: { width: "1920px", height: "1080px" },
          type: "desktop",
        },
        hd: {
          name: "720p",
          styles: { width: "1280px", height: "720px" },
          type: "desktop",
        },
        handheld: {
          name: "Handheld",
          styles: { width: "420px", height: "720px" },
          type: "mobile",
        },
      },
    },
  },
}

export default meta
type Story = StoryObj

export const TileMorph: Story = {
  name: "1. Tile morph",
  render: () => <LaunchPrototypeFrame prototype="tile-morph" />,
}

export const CurtainRise: Story = {
  name: "2. Curtain rise",
  render: () => <LaunchPrototypeFrame prototype="curtain-rise" />,
}

export const IrisBloom: Story = {
  name: "3. Iris bloom",
  render: () => <LaunchPrototypeFrame prototype="iris-bloom" />,
}

export const DepthDive: Story = {
  name: "4. Depth dive",
  render: () => <LaunchPrototypeFrame prototype="depth-dive" />,
}

function LaunchPrototypeFrame({
  prototype,
}: {
  readonly prototype: Prototype
}) {
  return (
    <ShiftHomeRoot items={DEMO_GAMES}>
      <LaunchTransitionShell prototype={prototype} />
    </ShiftHomeRoot>
  )
}

/**
 * Shell that owns the entire app surface for a launch prototype.
 *
 * The recede layer wraps the top bar, middle (rail + caption), and bottom
 * bar so dim / blur / scale / 3D recede applies to the whole shell, and
 * the launch overlay covers everything from the status bar at the top to
 * the HUD at the bottom — not just the rail band in the middle.
 *
 * Tile rect is still measured against this shell, so origin coordinates
 * for the morph / iris / cartridge / hyperdrive prototypes share the same
 * coordinate space as the overlay.
 */
function LaunchTransitionShell({
  prototype,
}: {
  readonly prototype: Prototype
}) {
  const { focused, railRef } = useShiftHome()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const dismissTimer = useRef<number | undefined>(undefined)
  const eventCounter = useRef(0)
  const [event, setEvent] = useState<LaunchEvent | null>(null)
  const reduced = !!useReducedMotion()

  const begin = useCallback(
    (game: GameRecord) => {
      window.clearTimeout(dismissTimer.current)
      const shell = shellRef.current
      if (!shell) return
      const shellRect = shell.getBoundingClientRect()
      const tile = railRef.current?.querySelector<HTMLElement>(
        `[data-tile-id="${CSS.escape(game.id)}"]`,
      )
      const tileRect = tile?.getBoundingClientRect()
      const origin: LaunchOrigin | null = tileRect
        ? {
            x: tileRect.left - shellRect.left,
            y: tileRect.top - shellRect.top,
            width: tileRect.width,
            height: tileRect.height,
            centerX: tileRect.left - shellRect.left + tileRect.width / 2,
            centerY: tileRect.top - shellRect.top + tileRect.height / 2,
          }
        : null
      eventCounter.current += 1
      setEvent({
        id: eventCounter.current,
        game,
        origin,
        surface: { width: shellRect.width, height: shellRect.height },
      })
      dismissTimer.current = window.setTimeout(
        () => setEvent(null),
        LAUNCH_PREVIEW_MS,
      )
    },
    [railRef],
  )

  useInputAction("confirm", () => begin(focused))

  // Auto-play once on mount so each story shows the transition without
  // requiring an input. Subsequent focus changes do not re-fire.
  const autoplayedRef = useRef(false)
  useEffect(() => {
    if (autoplayedRef.current) return
    autoplayedRef.current = true
    const initial = window.setTimeout(() => begin(focused), 600)
    return () => window.clearTimeout(initial)
  }, [begin, focused])

  useEffect(() => () => window.clearTimeout(dismissTimer.current), [])

  return (
    <div
      ref={shellRef}
      data-shift-launch-prototype={prototype}
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
    >
      <HomeRecede prototype={prototype} active={event !== null}>
        <ShiftHomeTopBar
          time={PLACEHOLDER_TIME}
          avatarSrc={PLACEHOLDER_AVATAR_SRC}
        />
        <section className="relative flex min-h-0 flex-1 flex-col justify-center gap-2">
          <ShiftHomeRail onItemClick={begin} />
          <ShiftHomeCaption />
        </section>
        <ShiftHomeBottomBar />
      </HomeRecede>
      <AnimatePresence>
        {event ? (
          <LaunchOverlay
            key={event.id}
            prototype={prototype}
            event={event}
            reduced={reduced}
          />
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        className="shift-pill shift-launch-replay text-sm font-bold"
        onClick={() => begin(focused)}
      >
        Replay transition
      </button>
    </div>
  )
}

const HOME_RECEDE: Record<
  Prototype,
  {
    readonly idle: Record<string, number | string>
    readonly active: Record<string, number | string>
    readonly transition: Transition
  }
> = {
  "tile-morph": {
    idle: { opacity: 1, scale: 1, filter: "blur(0px)" },
    active: { opacity: 0.16, scale: 0.96, filter: "blur(8px)" },
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
  "curtain-rise": {
    idle: { opacity: 1, y: 0, scale: 1 },
    active: { opacity: 0.4, y: -32, scale: 0.985 },
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
  "iris-bloom": {
    idle: { opacity: 1, scale: 1 },
    active: { opacity: 0.7, scale: 1.04 },
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
  "depth-dive": {
    idle: { opacity: 1, scale: 1, y: 0, rotateX: 0 },
    active: { opacity: 0.45, scale: 0.84, y: 30, rotateX: 14 },
    transition: { type: "spring", stiffness: 90, damping: 20, mass: 0.95 },
  },
}

function HomeRecede({
  prototype,
  active,
  children,
}: {
  readonly prototype: Prototype
  readonly active: boolean
  readonly children: ReactNode
}) {
  const config = HOME_RECEDE[prototype]
  return (
    <motion.div
      className="shift-launch-home-layer flex h-full w-full flex-col"
      animate={active ? config.active : config.idle}
      transition={config.transition}
    >
      {children}
    </motion.div>
  )
}

function LaunchOverlay({
  prototype,
  event,
  reduced,
}: {
  readonly prototype: Prototype
  readonly event: LaunchEvent
  readonly reduced: boolean
}) {
  switch (prototype) {
    case "tile-morph":
      return <TileMorphOverlay event={event} reduced={reduced} />
    case "curtain-rise":
      return <CurtainRiseOverlay event={event} reduced={reduced} />
    case "iris-bloom":
      return <IrisBloomOverlay event={event} reduced={reduced} />
    case "depth-dive":
      return <DepthDiveOverlay event={event} reduced={reduced} />
  }
}

const SPRING_HERO: Transition = {
  type: "spring",
  stiffness: 130,
  damping: 22,
  mass: 0.85,
}
const EASE_OUT: Transition = { duration: 0.6, ease: [0.16, 1, 0.3, 1] }

const REVEAL_UP: Variants = {
  hidden: { y: 28, opacity: 0 },
  show: { y: 0, opacity: 1, transition: EASE_OUT },
}

const STAGGER_PARENT: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.5 } },
}

/* -------------------------------------------------------------------------- *
 * Prototype 1 — Tile morph
 *
 * The focused tile's bounds expand into a hero card via a transform-based
 * morph (translate + scale, with border-radius eased in parallel). Home
 * dims and blurs behind it. Title metadata staggers in once the card
 * reaches its hero size.
 * -------------------------------------------------------------------------- */

function TileMorphOverlay({
  event,
  reduced,
}: {
  readonly event: LaunchEvent
  readonly reduced: boolean
}) {
  const { game, origin, surface } = event
  const target = {
    left: surface.width * 0.08,
    top: surface.height * 0.04,
    width: surface.width * 0.84,
    height: surface.height * 0.78,
  }
  const start = origin ?? {
    x: target.left + target.width / 2,
    y: target.top + target.height / 2,
    width: 12,
    height: 12,
    centerX: target.left + target.width / 2,
    centerY: target.top + target.height / 2,
  }
  const startScaleX = start.width / target.width
  const startScaleY = start.height / target.height
  const startX = start.x - target.left
  const startY = start.y - target.top

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.18 } }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <motion.div
        className="shift-launch-card"
        style={{
          position: "absolute",
          left: target.left,
          top: target.top,
          width: target.width,
          height: target.height,
          transformOrigin: "0 0",
        }}
        initial={
          reduced
            ? { x: 0, y: 0, scaleX: 1, scaleY: 1, borderRadius: 28, opacity: 1 }
            : {
                x: startX,
                y: startY,
                scaleX: startScaleX,
                scaleY: startScaleY,
                borderRadius: 6,
                opacity: 0.95,
              }
        }
        animate={{
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          borderRadius: 28,
          opacity: 1,
        }}
        exit={{ opacity: 0, transition: EASE_OUT }}
        transition={reduced ? { duration: 0 } : SPRING_HERO}
      >
        <GameArtwork
          game={game}
          variant="hero"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <motion.div
          className="absolute inset-x-0 bottom-0 grid gap-3 p-12"
          variants={STAGGER_PARENT}
          initial="hidden"
          animate="show"
        >
          <motion.span className="shift-launch-kicker" variants={REVEAL_UP}>
            Launching now
          </motion.span>
          <motion.span
            className="shift-launch-title shift-launch-title-large"
            variants={REVEAL_UP}
          >
            {getGameDisplayName(game)}
          </motion.span>
          <motion.div variants={REVEAL_UP}>
            <ProgressMeter />
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- *
 * Prototype 2 — Curtain rise
 *
 * A large rounded panel rises from the bottom of the surface on a slow
 * spring, ken-burns hero art lives behind it, foreground content staggers
 * in after the curtain settles.
 * -------------------------------------------------------------------------- */

function CurtainRiseOverlay({
  event,
  reduced,
}: {
  readonly event: LaunchEvent
  readonly reduced: boolean
}) {
  const { game } = event
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="shift-launch-curtain"
        initial={reduced ? { y: 0 } : { y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "30%", opacity: 0, transition: EASE_OUT }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: "spring", stiffness: 110, damping: 24, mass: 1.1 }
        }
      >
        <motion.div
          className="absolute inset-0 overflow-hidden"
          initial={{ scale: 1.12 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <GameArtwork
            game={game}
            variant="hero"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        </motion.div>
        <motion.div
          className="relative grid gap-3 p-14"
          variants={STAGGER_PARENT}
          initial="hidden"
          animate="show"
        >
          <motion.span className="shift-launch-kicker" variants={REVEAL_UP}>
            Now playing
          </motion.span>
          <motion.span
            className="shift-launch-title shift-launch-title-large"
            variants={REVEAL_UP}
          >
            {getGameDisplayName(game)}
          </motion.span>
          <motion.div variants={REVEAL_UP}>
            <ProgressMeter />
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- *
 * Prototype 3 — Iris bloom
 *
 * A circular clip expands from the focused tile's center outward,
 * revealing the launch surface underneath. Uses framer-motion's clipPath
 * animation; the radius is computed from the surface diagonal so the iris
 * always finishes off-screen regardless of where the tile sits.
 * -------------------------------------------------------------------------- */

function IrisBloomOverlay({
  event,
  reduced,
}: {
  readonly event: LaunchEvent
  readonly reduced: boolean
}) {
  const { game, origin, surface } = event
  const cx = origin?.centerX ?? surface.width / 2
  const cy = origin?.centerY ?? surface.height / 2
  const startRadius = Math.max((origin?.width ?? 16) / 2, 8)
  const endRadius =
    Math.hypot(
      Math.max(cx, surface.width - cx),
      Math.max(cy, surface.height - cy),
    ) * 1.05

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30"
      initial={{
        opacity: 1,
        clipPath: reduced
          ? `circle(${endRadius}px at ${cx}px ${cy}px)`
          : `circle(${startRadius}px at ${cx}px ${cy}px)`,
      }}
      animate={{ clipPath: `circle(${endRadius}px at ${cx}px ${cy}px)` }}
      exit={{ opacity: 0, transition: { duration: 0.45 } }}
      transition={
        reduced ? { duration: 0 } : { duration: 0.85, ease: [0.65, 0, 0.35, 1] }
      }
    >
      <div className="absolute inset-0">
        <GameArtwork
          game={game}
          variant="hero"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
        <motion.div
          className="absolute inset-x-0 bottom-0 grid gap-3 p-14"
          variants={STAGGER_PARENT}
          initial="hidden"
          animate="show"
        >
          <motion.span className="shift-launch-kicker" variants={REVEAL_UP}>
            Now entering
          </motion.span>
          <motion.span
            className="shift-launch-title shift-launch-title-large"
            variants={REVEAL_UP}
          >
            {getGameDisplayName(game)}
          </motion.span>
          <motion.div variants={REVEAL_UP}>
            <ProgressMeter />
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- *
 * Prototype 4 — Depth dive
 *
 * The home layer rotates back in 3D (perspective on the surface,
 * rotateX + scale on home), a blurred ambient backdrop fills the space,
 * and a hero card flies forward from below with a subtle rotateX recover.
 * -------------------------------------------------------------------------- */

function DepthDiveOverlay({
  event,
  reduced,
}: {
  readonly event: LaunchEvent
  readonly reduced: boolean
}) {
  const { game } = event
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center [perspective:1400px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1.05, opacity: 1 }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <GameArtwork
          game={game}
          variant="hero"
          className="h-full w-full object-cover blur-md"
        />
        <div className="absolute inset-0 bg-black/65" />
      </motion.div>
      <motion.div
        className="shift-launch-depth-card"
        initial={
          reduced
            ? { y: 0, rotateX: 0, opacity: 1 }
            : { rotateX: -28, y: 200, opacity: 0 }
        }
        animate={{ rotateX: 0, y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0, transition: EASE_OUT }}
        transition={
          reduced
            ? { duration: 0 }
            : {
                type: "spring",
                stiffness: 95,
                damping: 20,
                mass: 1.1,
                delay: 0.1,
              }
        }
      >
        <GameArtwork
          game={game}
          variant="hero"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <motion.div
          className="absolute inset-x-0 bottom-0 grid gap-3 p-12"
          variants={STAGGER_PARENT}
          initial="hidden"
          animate="show"
        >
          <motion.span className="shift-launch-kicker" variants={REVEAL_UP}>
            Diving in
          </motion.span>
          <motion.span
            className="shift-launch-title shift-launch-title-large"
            variants={REVEAL_UP}
          >
            {getGameDisplayName(game)}
          </motion.span>
          <motion.div variants={REVEAL_UP}>
            <ProgressMeter />
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function ProgressMeter() {
  return (
    <div className="shift-launch-progress" aria-hidden>
      <motion.div
        className="shift-launch-progress-fill"
        initial={{ width: "5%" }}
        animate={{ width: "92%" }}
        transition={{ duration: 2.6, ease: [0.5, 0, 0.5, 1] }}
      />
    </div>
  )
}

function GameArtwork({
  game,
  variant,
  className,
}: {
  readonly game: GameRecord
  readonly variant: "hero" | "tile"
  readonly className: string
}) {
  const src =
    variant === "hero"
      ? (getGameWideImageUrl(game) ?? getGameImageUrl(game))
      : getGameImageUrl(game)
  if (!src) {
    return (
      <div
        className={className}
        aria-hidden
        style={{ background: "var(--shift-surface-sunk)" }}
      />
    )
  }
  return <img src={src} alt="" className={className} draggable={false} />
}
