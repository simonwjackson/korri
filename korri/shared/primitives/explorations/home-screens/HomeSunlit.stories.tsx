/**
 * Visual exploration: "Sunlit" home screen — friendly, soft, family-arcade.
 *
 * Visual world is defined inline. This is a clone of the
 * Nintendo Switch 2 home cluster, used as a calibration anchor between
 * Hero (cinematic) and Mosaic (minimal). Sunlit imports a known-good
 * visual language wholesale — bright cream surface, soft rounding, a
 * lavender focus halo, and gamepad chrome rendered as visible furniture
 * rather than discreet edge labels.
 *
 * Phase 1 (this file) reproduces the home rail: a heterogeneous single
 * row with one wide landscape feature tile (resume target) plus vertical
 * 2:3 cover posters, framed by decorative status chrome on top and a
 * Menu pill + HUD on the bottom. Phases 2 (library grid) and 3 (drawer
 * overlay) ship separately as additional stories in this file.
 *
 * Visual language:
 *   - Warm cream-grey surface (light mode) or deep blue-black (dark).
 *   - Lavender focus halo around the focused tile (Switch trademark),
 *     bound to a `--focus-glow` token so it can swap to a Korri brand
 *     color later without touching JSX.
 *   - Heterogeneous rail via TilegridRailRoot's rectangular cellSize
 *     plus per-item column-only span (the leading tile is wider).
 *   - Caption below the rail: focused tile's name, with relative
 *     last-played time appended when the resume target is focused.
 *     Caption tracks the focused tile's x-position so the title sits
 *     under whichever tile has focus, including after the rail scrolls.
 *   - HUD at bottom-right reads `+ Options · X Close · A Continue`
 *     (Switch home convention; no `B Back` because home has nowhere to
 *     go back to). The X chip is decorative; `+` and `A` are wired to
 *     the input bus via two `HudButtons` instances bracketing the X.
 *
 * Sizing strategy: `container-type: inline-size` is declared on the root
 * so type and spacing utilities respond to this surface, not the viewport.
 * Same handheld→TV pattern as Hero and Mosaic.
 *
 * Color modes: switches with Storybook's color-mode toolbar via
 * `:root.dark` / `:root:not(.dark)` selectors on the scoped tokens.
 *
 * This file is a Storybook composition root. Per the project's React
 * skill, stories assemble distinct trees of compounds. There are no
 * boolean variants here — a different visual world is a different file.
 */

import "@fontsource-variable/nunito"

import {
  type GameRecord,
  getGameDisplayName,
  getGameImageUrl,
} from "@shared/fixtures/games/game"
import { games } from "@shared/fixtures/games/games"
import { TilegridCells } from "@shared/primitives/components/Tilegrid/components/TilegridCells"
import { TilegridRailRoot } from "@shared/primitives/components/Tilegrid/TilegridRailRoot"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Battery, Menu, Search, Sun, Wifi } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { HudButtons } from "./HudButtons"

/* -------------------------------------------------------------------------- */
/* Resume convention                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Story-local convention shared with Hero and Mosaic: the first fixture is
 * the resume target. In Sunlit it occupies a wide column-only span so the
 * leading cell lands at the requested 92:43 aspect ratio while the
 * trailing tiles render as 1:1 squares.
 *
 * Cell sizing math: with square cells of side S and gap G, the feature
 * tile's visible width across span N is N·S + (N-1)·G. The strict
 * 92:43 ratio requires G/S = 6/43 ≈ 0.1395; current values relax that
 * slightly to S = 172, G = 12 so the rail reads tighter without
 * shrinking the cells. Feature ratio is (2·172 + 12) / 172 ≈ 2.07,
 * within 3% of 92:43 (2.14) — imperceptible at TV viewing distance.
 */
const RESUME_SPAN = 2
const CELL_SIZE_PX = 258
const RAIL_GAP_PX = 18
const items: ReadonlyArray<GameRecord> = games

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Story-local landscape art for the feature tile. The fixtures emit
 * 600×600 picsum images intended for square cover crops; cropping those to
 * 16:9 would defeat the cinematic-landscape character that Switch's hero
 * tile depends on. A `-wide` seed suffix yields a deterministic but
 * distinct landscape source per fixture id, keeping the rest of the
 * fixture data untouched.
 */
function featureArtUrl(id: string): string {
  return `https://picsum.photos/seed/shift-${id}-wide/1280/720`
}

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

function HomeSunlit() {
  const resumeTarget = items[0]

  const [focusedId, setFocusedId] = useState<string>(resumeTarget.id)
  const [captionX, setCaptionX] = useState(0)
  const railRef = useRef<HTMLDivElement | null>(null)

  /**
   * Track focus inside the rail. The caption mirrors whichever tile has
   * focus. One delegated listener handles every cell, no per-cell hooks.
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
    // resumeTarget is module-scope (items[0]); deliberately runs once on mount.
  }, [])

  /**
   * Track the focused tile's x-position relative to the rail-region's
   * inner content-edge (which equals the caption's natural left, since
   * the caption shares px-12 with the rail-region). The caption applies
   * the result as translateX so its left edge sits under whichever tile
   * has focus.
   *
   * Recomputed on focus change, on rail scroll (capture phase — scroll
   * does not bubble), and on window resize. Rounded to whole pixels to
   * avoid subpixel text blur on Chromium.
   */
  useEffect(() => {
    const region = railRef.current
    if (!region) return

    const compute = () => {
      const tile = region.querySelector<HTMLElement>(
        `[data-tile-id="${CSS.escape(focusedId)}"]`,
      )
      if (!tile) return
      const tileRect = tile.getBoundingClientRect()
      const regionRect = region.getBoundingClientRect()
      const paddingLeft =
        Number.parseFloat(getComputedStyle(region).paddingLeft) || 0
      setCaptionX(Math.round(tileRect.left - regionRect.left - paddingLeft))
    }

    compute()

    region.addEventListener("scroll", compute, {
      capture: true,
      passive: true,
    })
    window.addEventListener("resize", compute)
    return () => {
      region.removeEventListener("scroll", compute, true)
      window.removeEventListener("resize", compute)
    }
  }, [focusedId])

  const focused = items.find(g => g.id === focusedId) ?? resumeTarget
  const isResumeFocused = focused.id === resumeTarget.id

  return (
    <div
      data-exploration="sunlit"
      className="sunlit-root relative flex h-screen w-full flex-col overflow-hidden text-[color:var(--ink)]"
    >
      <SunlitStyles />

      <TopBar />

      {/* Middle region: rail + caption are visually a single block,
          centered vertically by the column's justify-center. The rail
          wrapper has an explicit height because TilegridRailRoot's outer
          container is height:100% and would collapse without one. */}
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
        {/* Rail region. The focusin handler delegates to whichever cell
            received focus. */}
        {/* Rail wrapper height mirrors CELL_SIZE_PX so the row sits flush
            against its bottom edge — caption-to-rail proximity depends on
            this. The inline style is the single derived link from the TS
            constant; no other px values escape the theme system. */}
        <div
          ref={railRef}
          className="sunlit-rail-region px-12"
          style={{ height: CELL_SIZE_PX }}
        >
          <TilegridRailRoot<GameRecord>
            items={items}
            cellSize={{ width: CELL_SIZE_PX, height: CELL_SIZE_PX }}
            gap={RAIL_GAP_PX}
            getKey={g => g.id}
            getSpan={g => (g.id === resumeTarget.id ? RESUME_SPAN : 1)}
            getAriaLabel={g => getGameDisplayName(g)}
          >
            <TilegridCells<GameRecord>
              renderCell={({ cellProps, item }) => (
                <button
                  {...cellProps}
                  className="sunlit-tile relative cursor-pointer overflow-hidden rounded-[var(--radius-tile)] border-0 bg-[color:var(--surface-sunk)] p-0"
                  style={cellProps.style}
                >
                  {item.id === resumeTarget.id ? (
                    <FeatureTileArt game={item} />
                  ) : (
                    <PosterTileArt game={item} />
                  )}
                </button>
              )}
            />
          </TilegridRailRoot>
        </div>

        {/* Caption below the rail. Outer block snaps its transform to
            the focused tile's x-position on focus / scroll (no transition).
            Title text updates synchronously on focus change — no
            crossfade, no remount, no re-keyed animation. */}
        <Caption
          game={focused}
          isResumeFocused={isResumeFocused}
          captionX={captionX}
        />
      </div>

      <BottomBar />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Top bar — search pill (focusable, decorative) + status cluster             */
/* -------------------------------------------------------------------------- */

function TopBar() {
  return (
    <div className="sunlit-top-bar flex shrink-0 items-center justify-between gap-6 px-12 py-5">
      <SearchPill />
      <StatusCluster />
    </div>
  )
}

function SearchPill() {
  return (
    <button
      type="button"
      onClick={() => {
        // Decorative in Phase 1; focusable so the spatial-nav graph reflects
        // the real surface. Wiring lands later if needed.
      }}
      aria-label="Search for games, genres, or tags"
      className="sunlit-pill sunlit-search-pill text-lg"
    >
      <Search className="sunlit-pill-icon shrink-0" strokeWidth={2.25} />
      <span className="sunlit-search-placeholder">
        Search for games, genres, or tags…
      </span>
    </button>
  )
}

function StatusCluster() {
  return (
    <div
      aria-hidden
      className="sunlit-status-cluster flex shrink-0 items-center gap-6 text-lg text-[color:var(--ink-dim)]"
    >
      <span className="text-xl font-bold tabular-nums">4:24 PM</span>
      <Sun className="sunlit-status-icon" strokeWidth={2} />
      <Wifi className="sunlit-status-icon" strokeWidth={2} />
      <Battery className="sunlit-status-icon" strokeWidth={2} />
      <img
        src="https://i.pravatar.cc/96?u=korri-sunlit-user"
        alt=""
        className="sunlit-avatar"
        loading="lazy"
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Bottom bar — Menu pill + HUD                                              */
/* -------------------------------------------------------------------------- */

function BottomBar() {
  return (
    <div className="sunlit-bottom-bar flex shrink-0 items-center justify-between gap-8 px-12 py-5">
      <MenuButton />
      <HudCluster />
    </div>
  )
}

/**
 * MenuButton matches the HUD chip vocabulary on the right (dark circular
 * glyph + ink-dim label) so the bottom bar reads as one cohesive row of
 * chips rather than a primary CTA on the left and meta hints on the right.
 * Unlike the HUD chips, the Menu button is focusable (Phase 3 wires the
 * drawer); the lavender halo on the glyph circle is the focus signal.
 */
function MenuButton() {
  return (
    <button
      type="button"
      onClick={() => {
        // Decorative in Phase 1; focusable so the spatial-nav graph reflects
        // the real surface. Phase 3 wires this to open the side drawer.
      }}
      className="sunlit-menu-button"
    >
      <span aria-hidden className="hud-glyph">
        <Menu strokeWidth={2.5} className="sunlit-menu-glyph-icon" />
      </span>
      <span className="hud-label">Menu</span>
    </button>
  )
}

/**
 * The Switch home HUD reads `+ Options · X Close Software · A Continue`
 * left-to-right. We compose this as two HudButtons instances bracketing a
 * story-local static `<StaticHudChip>` so the order matches the source
 * exactly. Two siblings + a presentational chip beats inflating HudButtons
 * with a generic chip array; the static chip has no input-bus subscription.
 */
function HudCluster() {
  return (
    <div className="sunlit-hud-cluster flex items-center gap-10">
      <HudButtons
        actions={["options"]}
        optionsGlyph="+"
        optionsLabel="Options"
      />
      <StaticHudChip glyph="X" label="Close" />
      <HudButtons
        actions={["confirm"]}
        confirmGlyph="A"
        confirmLabel="Continue"
      />
    </div>
  )
}

function StaticHudChip({ glyph, label }: { glyph: string; label: string }) {
  return (
    <div className="hud" aria-hidden>
      <div className="hud-hint">
        <span className="hud-glyph">{glyph}</span>
        <span className="hud-label">{label}</span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Tile art                                                                   */
/* -------------------------------------------------------------------------- */

function FeatureTileArt({ game }: { game: GameRecord }) {
  return (
    <img
      src={featureArtUrl(game.id)}
      alt=""
      className="block h-full w-full object-cover"
      loading="lazy"
    />
  )
}

function PosterTileArt({ game }: { game: GameRecord }) {
  const url = getGameImageUrl(game)
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3 text-center text-sm uppercase tracking-widest text-[color:var(--ink-faint)]">
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
/* Caption — focused tile's name + relative time when resume is focused       */
/* -------------------------------------------------------------------------- */

function Caption({
  game,
  isResumeFocused,
  captionX,
}: {
  game: GameRecord
  isResumeFocused: boolean
  captionX: number
}) {
  const lastPlayed = game.userData?.lastPlayed
  const relativeLabel =
    isResumeFocused && lastPlayed ? formatRelative(lastPlayed) : undefined

  return (
    <div
      className="sunlit-caption shrink-0 px-12 pb-3 pt-2"
      style={{ transform: `translateX(${captionX}px)` }}
    >
      <div className="sunlit-caption-text flex items-baseline gap-4">
        <span className="text-3xl font-semibold text-[color:var(--ink)]">
          {getGameDisplayName(game)}
        </span>
        {relativeLabel ? (
          <span className="text-sm font-medium uppercase tracking-widest text-[color:var(--ink-faint)]">
            {relativeLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Scoped styles (color tokens, container declaration, focus glow, motion)    */
/* -------------------------------------------------------------------------- */

function SunlitStyles() {
  return (
    <style>{`
      /* --- Color tokens (light = primary intent) ---
         Calibrated against the Switch 2 home screenshots in /tmp/clone-ui/.
         Hex values are starting points; iterate during visual review. */
      [data-exploration="sunlit"] {
        --surface: #E8E6E1;
        --surface-raised: #F2F0EB;
        --surface-sunk: #DDDAD4;
        /* Ink palette — fully opaque, no alpha.
           - --ink (#1B1814) is deep warm black, used for primary text
             (game titles, captions, pill text).
           - --ink-dim (#44403C, stone-700) is the theme's closest value
             to #444. Used for header/footer secondary text — status
             cluster, time, HUD labels — and as the HUD glyph badge bg.
           - --ink-faint (#827F7B) is a step lighter than --ink-dim so
             dim < faint contrast holds for placeholder text.
           - --rule (#D4D2CD) is the hairline dividing tone. */
        --ink: #1B1814;
        --ink-dim: #44403C;
        --ink-faint: #827F7B;
        --rule: #D4D2CD;

        --focus-glow: hsl(252, 75%, 70%);

        --pill-bg: #FFFFFF;
        --pill-fg: #1B1814;

        /* Glyph background tracks --ink-dim so the chip badge sits at
           the same visual weight as its label, instead of reading as a
           heavier dark blob next to muted text. */
        --hud-glyph-bg: var(--ink-dim);
        --hud-glyph-fg: #F2F0EB;
        --hud-glyph-active-bg: var(--focus-glow);
        --hud-glyph-active-fg: #FFFFFF;

        /* --- Static-by-design values.

               --radius-tile: small fixed corner per design call. 4px
               doesn't scale because it's a hairline-class decoration
               (Tailwind's rounded-sm would be ~6px). Used via the
               rounded-[var(--radius-tile)] arbitrary value on tiles
               so consumers stay in the Tailwind utility system. */
        --radius-tile: 4px;

        /* --- Type voice. Sunlit overrides the design-system default
               (Geist, sharp/technical) with Nunito, a rounded friendly
               sans that matches the Switch tone. Falls back to the
               platform's rounded sans (SF Pro Rounded on Apple,
               ui-rounded generic) before defaulting to system sans. */
        font-family:
          "Nunito Variable",
          ui-rounded,
          "SF Pro Rounded",
          "Segoe UI Variable",
          system-ui,
          sans-serif;
      }

      /* --- Dark mode counterpart (Switch night blue) --- */
      :root.dark [data-exploration="sunlit"] {
        /* Pitch black surface stack — OLED-style. Raised and sunk
           collapse to the same value as --surface; rule, ink-dim and
           pill-bg carry the elevation/edge cues that surface contrast
           used to provide. */
        --surface: #000000;
        --surface-raised: #000000;
        --surface-sunk: #000000;
        /* Dark-mode ink palette — fully opaque, no alpha.
           --ink-dim is the flattened equivalent of #ffffff8a over
           pitch black: header/footer text in the top and bottom bars
           lands on #8A8A8A. */
        --ink: #ECE7DE;
        --ink-dim: #8A8A8A;
        --ink-faint: #5A5C62;
        --rule: #2A2D38;

        --focus-glow: hsl(252, 80%, 75%);

        --pill-bg: #1A2238;
        --pill-fg: #ECE7DE;

        /* Dark-mode HUD glyph: badge background is the flattened
           equivalent of #ffffff17 over pitch black (#171717), a
           quiet elevation tone. The glyph character matches the
           label color (--ink-dim, #8A8A8A) so each chip reads as
           one cohesive tone with a subtle darker badge behind it. */
        --hud-glyph-bg: #171717;
        --hud-glyph-fg: #8A8A8A;
        --hud-glyph-active-bg: var(--focus-glow);
        --hud-glyph-active-fg: #0F1422;

      }

      /* --- Container declaration so child cqi/cqh units resolve against
             this surface (the home), not the viewport. */
      [data-exploration="sunlit"].sunlit-root {
        container-type: inline-size;
        background-color: var(--surface);
      }

      /* Suppress Storybook's global :focus-visible ring on this surface;
         each interactive element below defines its own focus treatment. */
      [data-exploration="sunlit"] :focus { outline: none; }
      [data-exploration="sunlit"] :focus-visible { outline: none; }

      /* --- Hide scrollbars on the rail's horizontal scroll container.
             TilegridRailRoot's outer div is overflowX: auto; the visual
             language has no place for a chrome scrollbar. Cross-browser
             selectors cover Firefox, legacy IE/Edge, and WebKit. */
      [data-exploration="sunlit"] .sunlit-rail-region,
      [data-exploration="sunlit"] .sunlit-rail-region * {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      [data-exploration="sunlit"] .sunlit-rail-region::-webkit-scrollbar,
      [data-exploration="sunlit"] .sunlit-rail-region *::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }

      /* --- Tile focus state.
             Rendered via an ::after pseudo-element rather than CSS
             outline. The tile has overflow:hidden (needed to clip the
             image to the rounded corners), and Chromium clips
             negative-offset outlines against the element's own
             overflow box — the top edge of the ring gets eaten.

             A pseudo-element with inset:0 sits at the tile's inner
             edge, paints above the static <img> child, and is part of
             the tile's painting box rather than its overflow-clipped
             content, so it renders fully on all four edges regardless
             of parent or self overflow. The 4px thickness is
             hairline-class — intentionally static, not from --spacing. */
      [data-exploration="sunlit"] .sunlit-tile {
        position: relative;
        outline: none;
        transition: transform 180ms ease;
      }
      [data-exploration="sunlit"] .sunlit-tile::after {
        content: "";
        position: absolute;
        inset: 0;
        border: 4px solid transparent;
        border-radius: var(--radius-tile);
        pointer-events: none;
        transition: border-color 180ms ease;
      }
      [data-exploration="sunlit"] .sunlit-tile:focus-visible::after {
        border-color: var(--focus-glow);
      }
      [data-exploration="sunlit"] .sunlit-tile:focus-visible {
        transform: translateY(-1px);
        z-index: 1;
      }

      /* --- Pill (search + menu) shared treatment.
             Pills sit outside the rail's clipped scroll container, so an
             outer box-shadow halo is fine here — nothing clips it. */
      [data-exploration="sunlit"] .sunlit-pill {
        outline: none;
        border: 0;
        border-radius: 9999px;
        background: var(--pill-bg);
        color: var(--pill-fg);
        cursor: pointer;
        transition:
          background 180ms ease,
          box-shadow 180ms ease,
          transform 180ms ease;
      }
      [data-exploration="sunlit"] .sunlit-pill:focus-visible {
        box-shadow: 0 0 0 3px var(--focus-glow);
        transform: translateY(-1px);
      }
      [data-exploration="sunlit"] .sunlit-pill-icon {
        width: 1.4em;
        height: 1.4em;
        color: var(--ink-dim);
      }

      /* --- Search pill: icon-only at rest, expands to full pill on focus.
             At rest the search is a quiet icon embedded in the surface —
             not an open input field. Focus is the affordance that opens
             the field; the transition (background + width + placeholder
             fade-in) is the visual signal of 'now searching.'

             em-relative dimensions (1.4em, 3.4em) scale implicitly via
             the button's text-lg font-size, which is itself fluid via
             --text-lg. Padding and gap on the focused state derive from
             --spacing so they scale with the container, matching the
             rest of the surface. */
      [data-exploration="sunlit"] .sunlit-search-pill {
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0;
        /* Collapsed: button is exactly the icon's width. The icon's
           left edge sits at the button's left edge, which sits at the
           parent's px-12 boundary — visually flush with the Menu glyph
           circle and the caption on the rows below. */
        width: 1.4em;
        height: 3.4em;
        padding: 0;
        background: transparent;
        box-shadow: none;
        flex: 0 0 auto;
        transition:
          width 220ms ease,
          gap 180ms ease,
          padding 220ms ease,
          background 180ms ease,
          box-shadow 180ms ease,
          transform 180ms ease;
      }
      /* Search icon falls through to the generic .sunlit-pill-icon
         rule above (color: var(--ink-dim)) so it sits at the same
         tone as the rest of the header text — status cluster, time,
         day, etc. No search-pill-specific override. */

      /* The placeholder text is always rendered (so screen readers see
         it via the surrounding aria-label) but visually collapsed at
         rest via max-width + opacity, then revealed on focus. */
      [data-exploration="sunlit"] .sunlit-search-placeholder {
        max-width: 0;
        overflow: hidden;
        white-space: nowrap;
        opacity: 0;
        color: var(--ink-faint);
        transition:
          max-width 240ms ease,
          opacity 180ms ease;
      }

      /* Active state: expand into a full pill. Padding and gap derive
         from --spacing so they breathe with the container. */
      [data-exploration="sunlit"] .sunlit-search-pill:focus-visible {
        justify-content: flex-start;
        width: 40cqi;
        height: auto;
        padding: calc(4 * var(--spacing)) calc(6 * var(--spacing));
        gap: calc(4 * var(--spacing));
        background: var(--pill-bg);
      }
      [data-exploration="sunlit"] .sunlit-search-pill:focus-visible .sunlit-search-placeholder {
        max-width: 40cqi;
        opacity: 1;
      }

      /* --- Menu button: matches the HUD chip vocabulary on the right.
             Reuses the .hud-glyph and .hud-label class hooks so it sits
             visually in the same row as + Options / X Close / A Continue.
             Unlike the HUD chips, this button is focusable; the focus
             halo lights the glyph circle, not the whole row.

             Gap derives from --spacing so it scales with the container,
             same as the .hud-hint gap below — the menu button reads as
             one of the chips, not a special case. */
      [data-exploration="sunlit"] .sunlit-menu-button {
        display: inline-flex;
        align-items: center;
        gap: calc(3 * var(--spacing));
        outline: none;
        border: 0;
        background: transparent;
        padding: 0;
        cursor: pointer;
        color: inherit;
        border-radius: 9999px;
      }
      [data-exploration="sunlit"] .sunlit-menu-button:focus-visible .hud-glyph {
        box-shadow: 0 0 0 3px var(--focus-glow);
        transform: scale(1.05);
      }
      [data-exploration="sunlit"] .sunlit-menu-glyph-icon {
        width: 1em;
        height: 1em;
      }

      /* --- Status cluster (decorative, aria-hidden) --- */
      [data-exploration="sunlit"] .sunlit-status-icon {
        width: 1.4em;
        height: 1.4em;
      }
      [data-exploration="sunlit"] .sunlit-avatar {
        display: inline-block;
        width: 2.2em;
        height: 2.2em;
        border-radius: 9999px;
        object-fit: cover;
        box-shadow: 0 0 0 2px var(--surface);
      }

      /* --- HUD glyph treatment.
             Class hooks .hud, .hud-hint, .hud-glyph, and .hud-label are
             contributed by both HudButtons and the story-local static
             chip below; one rule set covers all three.

             Gaps derive from --spacing so they scale with the container.
             em-relative widths on the glyph circle scale implicitly via
             the chip's font-size (text-base, fluid). */
      [data-exploration="sunlit"] .hud {
        display: inline-flex;
        align-items: center;
        gap: calc(5 * var(--spacing));
      }
      [data-exploration="sunlit"] .hud-hint {
        display: inline-flex;
        align-items: center;
        gap: calc(3 * var(--spacing));
      }
      [data-exploration="sunlit"] .hud-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2em;
        height: 2em;
        border-radius: 9999px;
        background: var(--hud-glyph-bg);
        color: var(--hud-glyph-fg);
        font-size: var(--text-sm);
        font-weight: 800;
        line-height: 1;
        transition:
          background 160ms ease,
          color 160ms ease,
          transform 160ms ease;
      }
      [data-exploration="sunlit"] .hud-hint[data-active] .hud-glyph {
        background: var(--hud-glyph-active-bg);
        color: var(--hud-glyph-active-fg);
        transform: scale(1.1);
      }
      [data-exploration="sunlit"] .hud-label {
        font-size: var(--text-base);
        font-weight: 600;
        letter-spacing: 0;
        color: var(--ink-dim);
      }

      /* --- Caption motion.
             Outer .sunlit-caption snaps instantly to the focused tile's
             x-position (transform set inline from JS, no transition).
             A smooth horizontal slide read as awkward when crossing
             irregular tile widths and especially during continuous
             scroll — instant snap lets the caption read as 'belonging
             to' the focused tile rather than chasing it.

             Title text updates instantly on focus change. An earlier
             revision crossfaded the text via a re-keyed remount, but
             the fade read as latency rather than feedback once the
             rail itself centers — the rail motion is the focus signal
             and a competing fade muddied it. */

      @media (prefers-reduced-motion: reduce) {
        [data-exploration="sunlit"] .sunlit-tile {
          transition: none;
        }
        [data-exploration="sunlit"] .sunlit-pill {
          transition: none;
        }
        [data-exploration="sunlit"] .hud-glyph {
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
  title: "Explorations/Home Screens/Sunlit (Friendly)",
  component: HomeSunlit,
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
} satisfies Meta<typeof HomeSunlit>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
