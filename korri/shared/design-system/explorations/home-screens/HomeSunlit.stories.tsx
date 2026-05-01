/**
 * Visual exploration: "Sunlit" home screen — friendly, soft, family-arcade.
 *
 * Decoupled from the `shift` theme on purpose. This is a clone of the
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
 *   - Caption below the rail: green "LAST PLAYED" eyebrow + name when
 *     the resume target is focused; name only otherwise.
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

import { TilegridCells } from "@shared/design-system/components/Tilegrid/components/TilegridCells"
import { TilegridRailRoot } from "@shared/design-system/components/Tilegrid/TilegridRailRoot"
import { games } from "@shared/themes/shift/fixtures/games"
import {
  type GameRecord,
  getGameDisplayName,
  getGameImageUrl,
} from "@shared/themes/shift/schemas/game"
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
 * tile's visible width across span N is N·S + (N-1)·G. Holding cells
 * square forces (N·S + (N-1)·G) / S = 92/43, i.e. G/S = 6/43 ≈ 0.1395
 * for N = 2. Picking S = 200 and G = 28 lands the feature at
 * (2·200 + 28) / 200 = 2.14, identical to 92/43 within rounding.
 */
const RESUME_SPAN = 2
const CELL_SIZE_PX = 172
const RAIL_GAP_PX = 24
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

        {/* Caption below the rail. Re-mounted via key={focused.id} so the
            crossfade animation runs on every focus change. */}
        <Caption
          key={focused.id}
          game={focused}
          showEyebrow={isResumeFocused}
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
      <Sun className="sunlit-status-icon" strokeWidth={2} />
      <span className="text-xl font-bold tabular-nums">4:24 PM</span>
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
    <div className="sunlit-bottom-bar flex shrink-0 items-center justify-between gap-6 px-12 py-5">
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
    <div className="sunlit-hud-cluster flex items-center gap-6">
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
/* Caption — focus-driven, green eyebrow when resume target is focused        */
/* -------------------------------------------------------------------------- */

function Caption({
  game,
  showEyebrow,
}: {
  game: GameRecord
  showEyebrow: boolean
}) {
  const name = getGameDisplayName(game)
  const lastPlayed = game.userData?.lastPlayed
  const lastPlayedLabel =
    showEyebrow && lastPlayed ? formatRelative(lastPlayed) : undefined

  return (
    <div className="sunlit-caption flex shrink-0 items-baseline gap-4 px-12 pb-3 pt-2">
      {showEyebrow ? (
        <span className="text-sm font-bold uppercase tracking-widest text-[color:var(--last-played-eyebrow)]">
          Last played
        </span>
      ) : null}
      <span className="text-lg font-semibold text-[color:var(--ink)]">
        {name}
      </span>
      {lastPlayedLabel ? (
        <span className="text-sm font-medium uppercase tracking-widest text-[color:var(--ink-faint)]">
          {lastPlayedLabel}
        </span>
      ) : null}
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
        --ink: #1B1814;
        --ink-dim: rgba(27, 24, 20, 0.55);
        --ink-faint: rgba(27, 24, 20, 0.32);
        --rule: rgba(27, 24, 20, 0.10);

        --focus-glow: hsl(252, 75%, 70%);
        --focus-glow-soft: hsla(252, 75%, 70%, 0.45);
        --last-played-eyebrow: #4FAE3E;

        --pill-bg: #FFFFFF;
        --pill-fg: #1B1814;
        --pill-shadow: 0 1px 2px rgba(27, 24, 20, 0.06);

        --hud-glyph-bg: #2A2622;
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
        --surface: #0F1422;
        --surface-raised: #161D2F;
        --surface-sunk: #0A0E1A;
        --ink: #ECE7DE;
        --ink-dim: rgba(236, 231, 222, 0.62);
        --ink-faint: rgba(236, 231, 222, 0.34);
        --rule: rgba(236, 231, 222, 0.12);

        --focus-glow: hsl(252, 80%, 75%);
        --focus-glow-soft: hsla(252, 80%, 75%, 0.55);
        --last-played-eyebrow: #6FCD5C;

        --pill-bg: #1A2238;
        --pill-fg: #ECE7DE;
        --pill-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);

        --hud-glyph-bg: #ECE7DE;
        --hud-glyph-fg: #0F1422;
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
             The focus indicator uses a negative-offset outline so the
             ring renders INSIDE the tile box. TilegridRailRoot's outer
             scroll container has overflowY: hidden, which would clip an
             outer box-shadow halo. An inset outline is guaranteed
             visible at the tile's bounds without depending on ancestor
             overflow behavior. The 4px thickness is hairline-class —
             intentionally static, not derived from --spacing. */
      [data-exploration="sunlit"] .sunlit-tile {
        outline: none;
        transition:
          outline-color 180ms ease,
          transform 180ms ease;
      }
      [data-exploration="sunlit"] .sunlit-tile:focus-visible {
        outline: 4px solid var(--focus-glow);
        outline-offset: -4px;
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
        box-shadow: var(--pill-shadow);
        cursor: pointer;
        transition:
          background 180ms ease,
          box-shadow 180ms ease,
          transform 180ms ease;
      }
      [data-exploration="sunlit"] .sunlit-pill:focus-visible {
        box-shadow:
          0 0 0 3px var(--focus-glow),
          0 0 16px 3px var(--focus-glow-soft),
          var(--pill-shadow);
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
           circle and the 'LAST PLAYED' eyebrow on the rows below. */
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
      [data-exploration="sunlit"] .sunlit-search-pill .sunlit-pill-icon {
        color: var(--ink);
      }

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
        box-shadow: var(--pill-shadow);
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
        box-shadow:
          0 0 0 3px var(--focus-glow),
          0 0 14px 3px var(--focus-glow-soft);
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
        font-size: var(--text-base);
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

      /* --- Caption crossfade on focus change.
             The Caption is re-mounted via key={focused.id}, so the keyframe
             runs each time focus moves. */
      @keyframes sunlit-caption-cross {
        from { opacity: 0; transform: translateY(2px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      [data-exploration="sunlit"] .sunlit-caption {
        animation: sunlit-caption-cross 220ms ease-out;
      }

      @media (prefers-reduced-motion: reduce) {
        [data-exploration="sunlit"] .sunlit-caption {
          animation: none !important;
        }
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
