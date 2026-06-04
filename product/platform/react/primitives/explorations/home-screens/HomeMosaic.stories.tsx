/**
 * Visual exploration: "Mosaic" home screen — Rams/minimal, art whispers.
 *
 * Visual world is defined inline. This is the deliberate visual
 * opposite of HomeHero: a contact-sheet grid where the resume target is
 * larger only by *size* (no badge, no label, no "Continue" affordance). Type
 * lives only at the screen's edges — wordmark above, museum-label placard
 * below — leaving the grid pure.
 *
 * Visual language:
 *   - Warm cream surface (light mode) or warm graphite (dark mode).
 *   - Edge-to-edge dense grid; no dividers, no headers, no shadows.
 *   - Pure cover-art tiles, sharp corners, hairline focus frame.
 *   - Resume target gets a 2×2 span; hierarchy is size, never chrome.
 *   - Type is small, tracked, fixed at one edge of the screen only.
 *   - Motion is near-absent: focus crossfade only.
 *
 * Sizing strategy: `container-type: inline-size` is declared on the root, so
 * Tailwind type utilities (which derive from the fluid `--text-*` tokens in
 * the design-system theme) and spacing utilities (which derive from the
 * fluid `--spacing` token) respond to this surface's inline size — handheld,
 * desktop, or TV — without a separate layout per device.
 *
 * Color modes: switches with Storybook's color-mode toolbar via
 * `:root.dark` / `:root:not(.dark)` selectors on the scoped tokens.
 *
 * This file is a Storybook composition root. Per the project's React skill,
 * stories assemble distinct trees of compounds. There are no boolean
 * variants here — a different visual world is a different file
 * (HomeHero.stories.tsx).
 */

import {
  type GameRecord,
  getGameDisplayName,
  getGameImageUrl,
} from "@platform/fixtures/games/game"
import { games } from "@platform/fixtures/games/games"
import { TilegridCells } from "@platform/react/primitives/components/Tilegrid/components/TilegridCells"
import { TilegridScrollRoot } from "@platform/react/primitives/components/Tilegrid/TilegridScrollRoot"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useRef, useState } from "react"
import { HudButtons } from "./HudButtons"

/* -------------------------------------------------------------------------- */
/* Resume convention                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Story-local convention: the first fixture is the resume target. Express it
 * as a 2×2 span via the shape Tilegrid already understands (`item.span`), so
 * no new context, no new prop, no new schema field is introduced.
 */
const RESUME_SPAN = 2

type ResolvedItem = GameRecord & { span?: number }

const items: ReadonlyArray<ResolvedItem> = games.map((g, i) =>
  i === 0 ? { ...g, span: RESUME_SPAN } : g,
)

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatRelative(date: Date | undefined): string {
  if (!date) return "Never played"
  const ms = Date.now() - date.getTime()
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

function HomeMosaic() {
  const resumeTarget = items[0]

  const [focusedId, setFocusedId] = useState<string>(resumeTarget.id)
  const gridRef = useRef<HTMLDivElement | null>(null)

  /**
   * Track focus inside the grid. The placard mirrors whichever tile has
   * focus. One delegated listener handles every cell, no per-cell hooks.
   */
  useEffect(() => {
    const node = gridRef.current
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
    const node = gridRef.current
    if (!node) return
    const target = node.querySelector<HTMLElement>(
      `[data-tile-id="${CSS.escape(resumeTarget.id)}"]`,
    )
    target?.focus()
    // resumeTarget is module-scope (items[0]); dependency documents the intended anchor.
  }, [resumeTarget.id])

  const focused = items.find(g => g.id === focusedId) ?? resumeTarget

  return (
    <div
      data-exploration="mosaic"
      className="mosaic-root relative flex h-screen w-full flex-col overflow-hidden text-[color:var(--ink)]"
    >
      <MosaicStyles />

      <Wordmark />

      <div ref={gridRef} className="min-h-0 flex-1 px-16">
        <TilegridScrollRoot<ResolvedItem>
          items={items}
          cellSize={168}
          gap={6}
          getKey={g => g.id}
          getSpan={g => g.span ?? 1}
          getAriaLabel={g => getGameDisplayName(g)}
        >
          <TilegridCells<ResolvedItem>
            renderCell={({ cellProps, item }) => (
              <button
                {...cellProps}
                className="mosaic-tile relative cursor-pointer overflow-hidden border-0 bg-[color:var(--surface-sunk)] p-0"
                style={cellProps.style}
              >
                <TileArt game={item} />
              </button>
            )}
          />
        </TilegridScrollRoot>
      </div>

      <Placard game={focused} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Wordmark — header chrome                                                   */
/* -------------------------------------------------------------------------- */

function Wordmark() {
  return (
    <div className="flex shrink-0 items-baseline justify-between px-16 pb-5 pt-7">
      <div className="text-sm font-medium uppercase tracking-[0.42em] text-[color:var(--ink)]">
        Korri
      </div>
      <div className="text-sm uppercase tracking-[0.24em] text-[color:var(--ink-faint)]">
        Library
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Tile                                                                       */
/* -------------------------------------------------------------------------- */

function TileArt({ game }: { game: GameRecord }) {
  const url = getGameImageUrl(game)
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3 text-center text-sm uppercase tracking-[0.24em] text-[color:var(--ink-faint)]">
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
/* Placard — fixed at the screen's lower edge                                 */
/* -------------------------------------------------------------------------- */

function Placard({ game }: { game: GameRecord }) {
  const name = getGameDisplayName(game)
  const developer = game.metadata?.developer
  const lastPlayed = game.userData?.lastPlayed
  const lastPlayedLabel = lastPlayed ? formatRelative(lastPlayed) : undefined

  return (
    <div className="mosaic-placard flex shrink-0 items-center justify-between gap-8 border-t border-[color:var(--rule)] bg-[color:var(--surface)] px-16 pb-5 pt-4">
      <div
        className="mosaic-placard-meta flex min-w-0 items-baseline gap-6"
        key={game.id}
      >
        <div className="overflow-hidden truncate whitespace-nowrap text-base font-medium tracking-[0.01em] text-[color:var(--ink)]">
          {name}
        </div>
        {developer ? (
          <div className="whitespace-nowrap text-sm uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
            {developer}
          </div>
        ) : null}
        {lastPlayedLabel ? (
          <div className="whitespace-nowrap text-sm uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            Played {lastPlayedLabel}
          </div>
        ) : null}
      </div>

      <HudButtons confirmLabel="Open" backLabel="Back" optionsLabel="Options" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Scoped styles (color tokens, motion, focus, container declaration)         */
/* -------------------------------------------------------------------------- */

function MosaicStyles() {
  return (
    <style>{`
      /* --- Color tokens (light = primary intent) --- */
      [data-exploration="mosaic"] {
        --surface: #EFEBE2;
        --surface-sunk: #E5E0D4;
        --ink: #1B1714;
        --ink-dim: rgba(27, 23, 20, 0.55);
        --ink-faint: rgba(27, 23, 20, 0.28);
        --rule: rgba(27, 23, 20, 0.14);
        --hud-glyph-bg: rgba(27, 23, 20, 0.08);
        --hud-glyph-fg: #1B1714;
        --hud-glyph-active-bg: #1B1714;
        --hud-glyph-active-fg: #EFEBE2;
        --tile-focus-ring: #1B1714;
        --tile-focus-dot: #1B1714;
      }
      :root.dark [data-exploration="mosaic"] {
        --surface: #1A1714;
        --surface-sunk: #221E1A;
        --ink: #ECE7DE;
        --ink-dim: rgba(236, 231, 222, 0.6);
        --ink-faint: rgba(236, 231, 222, 0.3);
        --rule: rgba(236, 231, 222, 0.14);
        --hud-glyph-bg: rgba(236, 231, 222, 0.1);
        --hud-glyph-fg: #ECE7DE;
        --hud-glyph-active-bg: #ECE7DE;
        --hud-glyph-active-fg: #1A1714;
        --tile-focus-ring: #ECE7DE;
        --tile-focus-dot: #ECE7DE;
      }

      /* --- Container declaration so child cqi/cqh units resolve against
             this surface (the home), not the viewport. */
      [data-exploration="mosaic"].mosaic-root {
        container-type: inline-size;
        background-color: var(--surface);
      }

      /* Suppress Storybook's global :focus-visible ring on this surface;
         the focus styles below define their own treatment. */
      [data-exploration="mosaic"] :focus { outline: none; }
      [data-exploration="mosaic"] :focus-visible { outline: none; }

      /* --- Tile (focus state) --- */
      [data-exploration="mosaic"] .mosaic-tile {
        outline: none;
        transition: box-shadow 180ms ease;
      }
      [data-exploration="mosaic"] .mosaic-tile:focus-visible {
        box-shadow: 0 0 0 1.5px var(--tile-focus-ring);
        z-index: 1;
      }
      [data-exploration="mosaic"] .mosaic-tile::after {
        content: "";
        position: absolute;
        top: calc(var(--spacing) * 2);
        right: calc(var(--spacing) * 2);
        width: calc(var(--spacing) * 1.5);
        height: calc(var(--spacing) * 1.5);
        background: var(--tile-focus-dot);
        opacity: 0;
        transition: opacity 180ms ease;
      }
      [data-exploration="mosaic"] .mosaic-tile:focus-visible::after {
        opacity: 1;
      }

      /* --- HUD (variant-specific decoration on shared structure) --- */
      [data-exploration="mosaic"] .hud {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--spacing) * 4);
      }
      [data-exploration="mosaic"] .hud-hint {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--spacing) * 2);
      }
      [data-exploration="mosaic"] .hud-glyph {
        width: calc(var(--spacing) * 5);
        height: calc(var(--spacing) * 5);
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
      [data-exploration="mosaic"] .hud-hint[data-active] .hud-glyph {
        background: var(--hud-glyph-active-bg);
        color: var(--hud-glyph-active-fg);
        transform: scale(1.1);
      }
      [data-exploration="mosaic"] .hud-label {
        font-size: var(--text-sm);
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--ink-dim);
      }

      /* --- Motion --- */
      @keyframes placard-cross {
        from { opacity: 0; transform: translateY(2px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      [data-exploration="mosaic"] .mosaic-placard-meta {
        animation: placard-cross 220ms ease-out;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-exploration="mosaic"] .mosaic-placard-meta {
          animation: none !important;
        }
        [data-exploration="mosaic"] .mosaic-tile {
          transition: none;
        }
      }
    `}</style>
  )
}

/* -------------------------------------------------------------------------- */
/* Storybook                                                                  */
/* -------------------------------------------------------------------------- */

const meta = {
  title: "Explorations/Home Screens/Mosaic (Minimal)",
  component: HomeMosaic,
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
} satisfies Meta<typeof HomeMosaic>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
