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
 *
 * Phase 1 of this story is intentionally minimal: scaffold only. The
 * rail, caption, and chrome land in subsequent commits per the plan at
 * docs/plans/2026-05-01-001-feat-home-sunlit-phase-1-plan.md.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

function HomeSunlit() {
  return (
    <div
      data-exploration="sunlit"
      className="sunlit-root relative flex h-screen w-full flex-col overflow-hidden text-[color:var(--ink)]"
    >
      <SunlitStyles />

      {/* Top bar lands in Unit 4 (chrome). Slot reserved here so the
          surface holds shape during scaffolding and to make additive
          commits visually obvious in PR review. */}
      <div className="sunlit-top-bar shrink-0" />

      {/* Rail + caption land in Unit 3. Middle region absorbs remaining
          vertical space between the top and bottom chrome. */}
      <div className="sunlit-middle min-h-0 flex-1" />

      {/* Bottom bar lands in Unit 4 (Menu pill + HUD). */}
      <div className="sunlit-bottom-bar shrink-0" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Scoped styles (color tokens, container declaration)                        */
/* -------------------------------------------------------------------------- */

function SunlitStyles() {
  return (
    <style>{`
      /* --- Color tokens (light = primary intent) ---
         Calibrated against the Switch 2 home screenshots in /tmp/clone-ui/.
         Hex values are starting points; iterate during Unit 3 / Unit 4
         visual review. */
      [data-exploration="sunlit"] {
        --surface: #E8E6E1;
        --surface-raised: #F2F0EB;
        --surface-sunk: #DDDAD4;
        --ink: #1B1814;
        --ink-dim: rgba(27, 24, 20, 0.55);
        --ink-faint: rgba(27, 24, 20, 0.32);
        --rule: rgba(27, 24, 20, 0.10);

        --focus-glow: hsl(252, 75%, 70%);
        --last-played-eyebrow: #4FAE3E;

        --pill-bg: #FFFFFF;
        --pill-fg: #1B1814;
        --pill-shadow: 0 1px 2px rgba(27, 24, 20, 0.06);

        --hud-glyph-bg: #2A2622;
        --hud-glyph-fg: #F2F0EB;
        --hud-glyph-active-bg: var(--focus-glow);
        --hud-glyph-active-fg: #FFFFFF;

        --avatar-bg: #F2C9D8;
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
        --last-played-eyebrow: #6FCD5C;

        --pill-bg: #1A2238;
        --pill-fg: #ECE7DE;
        --pill-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);

        --hud-glyph-bg: #ECE7DE;
        --hud-glyph-fg: #0F1422;
        --hud-glyph-active-bg: var(--focus-glow);
        --hud-glyph-active-fg: #0F1422;

        --avatar-bg: #5C7DAE;
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
