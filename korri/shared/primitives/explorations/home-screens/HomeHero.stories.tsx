/**
 * Visual exploration: "Hero" home screen — cinematic, lean-back, art-roars.
 *
 * Visual world is defined inline. Defines its own visual world
 * inline so the comparison against HomeMosaic is honest. The only project
 * dependencies are the domain-agnostic Tilegrid primitive, the input bus
 * (for the HUD), and the games fixtures (content, not theme).
 *
 * Visual language:
 *   - Deep void background (dark mode) or warm bone (light mode).
 *   - Hero key-art owns ~70% of the screen.
 *   - Bottom rail emerges from the surface via a long fade gradient.
 *   - Resume ritual is explicit: title + last-played caption + Continue pill.
 *   - Type: a single sans (Geist), 400/600, small-caps tracking on labels.
 *   - Motion: slow ken-burns on the hero, soft crossfade on focus change.
 *
 * Sizing strategy: `container-type: inline-size` is declared on the root, so
 * every Tailwind type utility (which derives from the fluid `--text-*` tokens
 * defined in the design-system theme) and every spacing utility (which
 * derives from the fluid `--spacing` token) responds to this surface's
 * inline size — handheld, desktop, or TV — without a separate layout per
 * device.
 *
 * Color modes: switches with Storybook's color-mode toolbar via
 * `:root.dark` / `:root:not(.dark)` selectors on the scoped tokens.
 *
 * This file is a Storybook composition root. Per the project's React skill,
 * stories assemble distinct trees of compounds. There are no boolean
 * variants here — a different visual world is a different file
 * (HomeMosaic.stories.tsx).
 */

import {
  type GameRecord,
  getGameDisplayName,
  getGameImageUrl,
} from "@shared/fixtures/games/game"
import { games } from "@shared/fixtures/games/games"
import { TilegridCells } from "@shared/primitives/components/Tilegrid/components/TilegridCells"
import { TilegridRailRoot } from "@shared/primitives/components/Tilegrid/TilegridRailRoot"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { HudButtons } from "./HudButtons"

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatRelative(date: Date | undefined): string {
  if (!date) return "Never played"
  const ms = Date.now() - date.getTime()
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

function formatPlaytime(minutes: number | undefined): string | undefined {
  if (!minutes) return undefined
  if (minutes < 60) return `${minutes}m played`
  const hours = Math.round(minutes / 60)
  return `${hours}h played`
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

function HomeHero() {
  // The first fixture is the most-recent-played by construction; treat it as
  // the resume target. Story-local convention; no schema change needed.
  const resumeTarget = games[0]
  const railItems = games

  const [focusedId, setFocusedId] = useState<string>(resumeTarget.id)
  const railRef = useRef<HTMLDivElement | null>(null)

  /**
   * Track focus inside the rail. Each cell carries `data-tile-id` (set by
   * TilegridCells); the hero reads this id to pick which game's art to
   * display. One delegated listener handles every cell, no per-cell hooks.
   */
  useEffect(() => {
    const node = railRef.current
    if (!node) return
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null
      const id = target?.dataset.tileId
      if (id) setFocusedId(id)
    }
    node.addEventListener("focusin", onFocusIn)
    return () => node.removeEventListener("focusin", onFocusIn)
  }, [])

  /**
   * Place initial focus on the resume target so spatial navigation has a
   * visible anchor on mount.
   */
  useEffect(() => {
    const node = railRef.current
    if (!node) return
    const target = node.querySelector<HTMLElement>(
      `[data-tile-id="${CSS.escape(resumeTarget.id)}"]`,
    )
    target?.focus()
    // resumeTarget is module-scope (games[0]); dependency documents the intended anchor.
  }, [resumeTarget.id])

  const focused = railItems.find(g => g.id === focusedId) ?? resumeTarget

  return (
    <div
      data-exploration="hero"
      className="hero-root relative h-screen w-full overflow-hidden text-[color:var(--ink)]"
    >
      <HeroStyles />

      <HeroArt key={focused.id} game={focused} />

      <HeroOverlay game={focused} />

      <div className="hero-hud absolute right-16 top-8 z-[2]">
        <HudButtons
          confirmLabel="Continue"
          backLabel="Back"
          optionsLabel="Options"
        />
      </div>

      <div ref={railRef} className="absolute inset-x-0 bottom-0 px-16 pb-14">
        <RailHeader />
        <TilegridRailRoot<GameRecord>
          items={railItems}
          cellSize={180}
          gap={14}
          getKey={g => g.id}
          getAriaLabel={g => getGameDisplayName(g)}
        >
          <TilegridCells<GameRecord>
            renderCell={({ cellProps, item }) => (
              <button
                {...cellProps}
                className="hero-tile cursor-pointer overflow-hidden rounded-sm border-0 bg-[color:var(--tile-rest-bg)] p-0"
                style={cellProps.style}
              >
                <RailTileArt game={item} />
              </button>
            )}
          />
        </TilegridRailRoot>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Hero — art + treatment                                                     */
/* -------------------------------------------------------------------------- */

function HeroArt({ game }: { game: GameRecord }) {
  const url = getGameImageUrl(game)
  return (
    <div
      className="hero-art absolute inset-0"
      style={{
        // Inline because the URL is dynamic per game; the hero's *visual
        // treatment* (size, position, animations) lives in scoped CSS.
        backgroundImage: url
          ? `url(${url})`
          : "linear-gradient(135deg, var(--surface-raised), var(--surface))",
      }}
    >
      <div className="hero-art-overlay absolute inset-0" />
    </div>
  )
}

function HeroOverlay({ game }: { game: GameRecord }) {
  const name = getGameDisplayName(game)
  const lastPlayed = formatRelative(game.userData?.lastPlayed)
  const playtime = formatPlaytime(game.userData?.playtime)
  const developer = game.metadata?.developer

  return (
    <div
      // re-trigger fade on focus change by keying on the game id
      key={game.id}
      // Position the overlay relative to the hero's container, not the
      // viewport: top via cqh so it lands ~12% down regardless of context;
      // left/right and max-width via the fluid spacing scale.
      className="hero-overlay absolute left-16 right-16 top-[12cqh] flex max-w-[760px] flex-col gap-6"
    >
      <Eyebrow>Continue playing</Eyebrow>
      <h1 className="hero-title m-0 text-6xl font-semibold leading-[0.96] tracking-[-0.025em] text-[color:var(--ink)]">
        {name}
      </h1>
      {developer ? (
        <div className="text-lg tracking-[0.005em] text-[color:var(--ink-dim)]">
          {developer}
        </div>
      ) : null}
      <Caption>
        Last played {lastPlayed}
        {playtime ? ` · ${playtime}` : ""}
      </Caption>
      <ContinuePill />
    </div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm font-medium uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
      {children}
    </div>
  )
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm uppercase tracking-[0.12em] text-[color:var(--ink-dim)]">
      {children}
    </div>
  )
}

function ContinuePill() {
  return (
    <div
      className="hero-continue mt-3.5 inline-flex w-fit items-center gap-3.5 rounded-full border border-[color:var(--ink)] px-6.5 py-3.5 text-sm font-medium uppercase tracking-[0.18em] text-[color:var(--ink)] backdrop-blur-sm"
      aria-hidden
    >
      <span className="text-sm">▶</span>
      <span>Continue</span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Rail                                                                       */
/* -------------------------------------------------------------------------- */

function RailHeader() {
  return (
    <div className="mb-5 flex items-baseline justify-between pr-2">
      <Eyebrow>Library</Eyebrow>
      <div className="text-sm uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
        {games.length} games
      </div>
    </div>
  )
}

function RailTileArt({ game }: { game: GameRecord }) {
  const url = getGameImageUrl(game)
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3 text-center text-sm uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
        {getGameDisplayName(game)}
      </div>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className="block h-full w-full object-cover"
      loading="lazy"
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Scoped styles (color tokens, motion, focus, container declaration)         */
/* -------------------------------------------------------------------------- */

function HeroStyles() {
  return (
    <style>{`
      /* --- Color tokens (dark = primary intent) --- */
      [data-exploration="hero"] {
        --surface: #08080C;
        --surface-raised: #10101A;
        --ink: #F4F4F5;
        --ink-dim: rgba(244, 244, 245, 0.6);
        --ink-faint: rgba(244, 244, 245, 0.35);
        --vignette-edge: rgba(0, 0, 0, 0.55);
        --fade-to-surface: rgba(8, 8, 12, 0);
        --fade-to-surface-end: #08080C;
        --shadow-focused: 0 18px 32px -12px rgba(0, 0, 0, 0.8);
        --hud-bg: rgba(244, 244, 245, 0.05);
        --hud-border: rgba(244, 244, 245, 0.12);
        --hud-glyph-bg: rgba(244, 244, 245, 0.14);
        --hud-glyph-fg: #F4F4F5;
        --hud-glyph-active-bg: #F4F4F5;
        --hud-glyph-active-fg: #08080C;
        --tile-rest-bg: #10101A;
      }
      :root:not(.dark) [data-exploration="hero"] {
        --surface: #F8F6F1;
        --surface-raised: #ECE7DD;
        --ink: #14110E;
        --ink-dim: rgba(20, 17, 14, 0.62);
        --ink-faint: rgba(20, 17, 14, 0.38);
        --vignette-edge: rgba(0, 0, 0, 0.18);
        --fade-to-surface: rgba(248, 246, 241, 0);
        --fade-to-surface-end: #F8F6F1;
        --shadow-focused: 0 18px 32px -14px rgba(20, 17, 14, 0.35);
        --hud-bg: rgba(20, 17, 14, 0.04);
        --hud-border: rgba(20, 17, 14, 0.14);
        --hud-glyph-bg: rgba(20, 17, 14, 0.1);
        --hud-glyph-fg: #14110E;
        --hud-glyph-active-bg: #14110E;
        --hud-glyph-active-fg: #F8F6F1;
        --tile-rest-bg: #ECE7DD;
      }

      /* --- Container declaration so child cqi/cqh units resolve against
             this surface (the home), not the viewport. */
      [data-exploration="hero"].hero-root {
        container-type: inline-size;
        background-color: var(--surface);
      }

      /* Suppress Storybook's global :focus-visible ring on this surface;
         the focus styles below define their own treatment. */
      [data-exploration="hero"] :focus { outline: none; }
      [data-exploration="hero"] :focus-visible { outline: none; }

      /* --- Hero art --- */
      [data-exploration="hero"] .hero-art {
        background-size: cover;
        background-position: center;
        animation:
          hero-fade-in 480ms ease-out,
          hero-ken-burns 18s ease-in-out infinite;
        will-change: transform, opacity;
      }
      [data-exploration="hero"] .hero-art-overlay {
        background:
          radial-gradient(ellipse at 35% 30%, transparent 0%, var(--vignette-edge) 100%),
          linear-gradient(to bottom, var(--fade-to-surface) 35%, var(--fade-to-surface-end) 92%),
          linear-gradient(to right, var(--vignette-edge) 0%, transparent 60%);
      }

      /* --- Hero overlay --- */
      [data-exploration="hero"] .hero-overlay {
        animation: hero-fade-in 320ms ease-out;
      }
      [data-exploration="hero"] .hero-title {
        text-shadow: 0 2px 24px rgba(0, 0, 0, 0.45);
      }
      :root:not(.dark) [data-exploration="hero"] .hero-title {
        text-shadow: 0 2px 18px rgba(255, 255, 255, 0.45);
      }
      [data-exploration="hero"] .hero-continue {
        background: rgba(244, 244, 245, 0.04);
      }
      :root:not(.dark) [data-exploration="hero"] .hero-continue {
        background: rgba(20, 17, 14, 0.04);
      }

      /* --- HUD (variant-specific decoration on the shared structure) --- */
      [data-exploration="hero"] .hud {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--spacing) * 2);
        padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
        background: var(--hud-bg);
        border: 1px solid var(--hud-border);
        border-radius: 9999px;
        backdrop-filter: blur(8px);
      }
      [data-exploration="hero"] .hud-hint {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--spacing) * 2);
        padding: calc(var(--spacing) * 1) calc(var(--spacing) * 2.5)
                 calc(var(--spacing) * 1) calc(var(--spacing) * 1);
      }
      [data-exploration="hero"] .hud-glyph {
        width: calc(var(--spacing) * 7);
        height: calc(var(--spacing) * 7);
        border-radius: 9999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: var(--text-sm);
        font-weight: 600;
        background: var(--hud-glyph-bg);
        color: var(--hud-glyph-fg);
        transition: background 160ms ease, color 160ms ease, transform 160ms ease;
      }
      [data-exploration="hero"] .hud-hint[data-active] .hud-glyph {
        background: var(--hud-glyph-active-bg);
        color: var(--hud-glyph-active-fg);
        transform: scale(1.1);
      }
      [data-exploration="hero"] .hud-label {
        font-size: var(--text-sm);
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--ink-dim);
      }

      /* --- Tile (focus state) --- */
      [data-exploration="hero"] .hero-tile {
        outline: none;
        transition: opacity 320ms ease, transform 320ms ease, box-shadow 320ms ease;
        opacity: 0.5;
      }
      [data-exploration="hero"] .hero-tile:focus-visible {
        opacity: 1;
        transform: scale(1.06);
        box-shadow:
          0 0 0 1.5px var(--ink),
          var(--shadow-focused);
        z-index: 1;
      }

      /* --- Motion --- */
      @keyframes hero-ken-burns {
        0%   { transform: scale(1.04) translate3d(0%, 0%, 0); }
        50%  { transform: scale(1.10) translate3d(-1.5%, -1%, 0); }
        100% { transform: scale(1.04) translate3d(0%, 0%, 0); }
      }
      @keyframes hero-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        [data-exploration="hero"] .hero-art,
        [data-exploration="hero"] .hero-overlay {
          animation: none !important;
        }
        [data-exploration="hero"] .hero-tile {
          transition: opacity 120ms ease, box-shadow 120ms ease;
        }
      }
    `}</style>
  )
}

/* -------------------------------------------------------------------------- */
/* Storybook                                                                  */
/* -------------------------------------------------------------------------- */

const meta = {
  title: "Explorations/Home Screens/Hero (Cinematic)",
  component: HomeHero,
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
        tablet: {
          name: "Tablet",
          styles: { width: "900px", height: "1200px" },
          type: "tablet",
        },
        handheld: {
          name: "Handheld",
          styles: { width: "420px", height: "720px" },
          type: "mobile",
        },
      },
    },
  },
} satisfies Meta<typeof HomeHero>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
