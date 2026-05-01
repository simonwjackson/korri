---
title: Negative-offset CSS outlines clipped by overflow:hidden (Chromium)
date: 2026-05-01
category: ui-bugs
module: korri/shared/design-system + any tile/card/poster pattern with rounded corners and image content
problem_type: ui_bug
component: tooling
symptoms:
  - "Focus ring on a tile button shows only three sides; the top edge is missing"
  - "outline: 4px solid; outline-offset: -4px renders partially or not at all on focused tiles"
  - "Focus indicator is fully visible if the tile lacks overflow:hidden, but disappears when overflow:hidden is added back"
  - "Bug only reproduces in Chromium (Chrome, Edge, desktop Safari Webkit also affected); Firefox renders the inset outline correctly"
  - "axe / keyboard-navigation users complain about lost focus targets even though the outline rule is present in computed CSS"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
related_components:
  - frontend_stimulus
  - design_system
tags:
  - css
  - focus
  - accessibility
  - outline
  - overflow
  - chromium
  - design-system
  - keyboard-navigation
  - focus-ring
  - pseudo-element
---

# Negative-offset CSS outlines clipped by `overflow: hidden` (Chromium)

## Problem

When a focusable element has `overflow: hidden` set (commonly to clip an `<img>` child to rounded corners), Chromium clips negative-offset outlines against the element's own overflow box. The visible result is a focus ring with one or more edges missing — most often the top edge — even though the CSS computed style is fully present and correct.

This is a documented Chromium / Webkit quirk. Firefox renders the inset outline correctly. The bug is portable across any "tile / card / poster" pattern that:

1. Wraps an image or other large child in a button or `<a>`,
2. Uses `overflow: hidden` to clip that child to the parent's `border-radius`,
3. Indicates focus with a CSS `outline` plus a negative `outline-offset` to keep the ring inside the rounded box.

## Symptoms

- The focused tile shows a focus ring with the top edge clipped or missing entirely. Side and bottom edges may also clip depending on the corner radius.
- DevTools "Computed styles" shows `outline: 4px solid <color>; outline-offset: -4px;` correctly applied — there is no overridden rule.
- Removing `overflow: hidden` from the tile makes the outline render fully (but breaks the rounded-image clipping that the `overflow: hidden` was there for).
- Switching to a positive `outline-offset` value renders the ring outside the tile, fully visible — but it is then susceptible to being clipped by *ancestor* `overflow: hidden`, which is often what motivated the negative offset in the first place (rail / scroll containers).
- The bug reproduces in Chrome, Edge, Brave, and other Blink-based browsers, plus desktop Safari (Webkit). Firefox is not affected.

## What Didn't Work

- **Increasing the outline thickness.** A thicker inset outline (`8px`, `10px`) is clipped at the same edges in the same way; thickness only changes the visible portion of the surviving edges.
- **Switching from `outline` to `box-shadow inset`.** An inset box-shadow paints behind borders and behind content, so the `<img>` child inside the tile renders on top of it and hides the focus indicator entirely.
- **Adjusting `outline-color` to use a translucent color so the clip is less visible.** The clip is geometric, not a color/alpha issue. A semi-transparent ring is still clipped at the same edges.
- **Removing the tile's `border-radius` to match a sharp-corner outline.** Doesn't help — the clip is on the overflow box, which is rectangular regardless of `border-radius`.
- **Removing `overflow: hidden` on the tile and clipping the image with `clip-path` instead.** Works visually for the focus ring, but `clip-path: inset(0 round Xpx)` triggers a separate set of paint and stacking-context issues, and image transitions / hover scaling behave differently. Not worth the trade.

## Solution

Render the focus ring as an `::after` pseudo-element with an absolute position and a transparent border that becomes colored on `:focus-visible`. The pseudo-element lives inside the tile's painting box, paints above the static `<img>` child by default, and is geometrically constrained to `inset: 0` so no clip is possible.

```css
/* BROKEN — Chromium clips the top edge of the inset outline against
   the tile's own overflow box. */
.tile {
  position: relative;
  overflow: hidden;          /* clips <img> to the tile's border-radius */
  border-radius: 4px;
}
.tile:focus-visible {
  outline: 4px solid var(--focus-color);
  outline-offset: -4px;       /* renders inside the tile — clipped */
}

/* WORKS — pseudo-element renders fully on all four edges. */
.tile {
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  outline: none;              /* suppress the default outline */
}
.tile::after {
  content: "";
  position: absolute;
  inset: 0;                   /* hugs the tile's bounds exactly */
  border: 4px solid transparent;
  border-radius: inherit;     /* match the tile's corner radius */
  pointer-events: none;       /* preserve click-through to the button */
  transition: border-color 180ms ease;
}
.tile:focus-visible::after {
  border-color: var(--focus-color);
}
```

Three details that matter:

1. **`position: absolute; inset: 0`** keeps the pseudo-element at the same bounds as the tile. The element cannot overflow the tile and therefore cannot be clipped by the tile's `overflow: hidden`.
2. **`border` rather than `outline`** renders inside the pseudo-element's box, which is inside the tile's box. Outline would have the same clipping problem.
3. **`pointer-events: none`** is mandatory if the tile is interactive — without it, the pseudo-element catches mouse events and the underlying button stops receiving clicks.

## Why This Works

The Chromium clipping bug is specifically about how the browser composites outlines drawn at negative `outline-offset` values. Outlines are rendered as a separate paint step that, in spec, sits on top of the element's content. In Chromium's implementation, the negative-offset case is special-cased and gets clipped against the element's overflow rectangle as if the outline were drawn at the inner edge of the content box — which it effectively is.

A pseudo-element side-steps this entirely:

- The pseudo-element is a real child of the tile, not a separate paint step.
- Children of an `overflow: hidden` element are clipped only when they extend *outside* the parent's content box. A pseudo-element with `inset: 0` is exactly the same size as its parent, so it never overflows and never triggers the clip.
- Children paint above the static `<img>` content in normal source order, so the focus ring renders on top of the image without needing `z-index`.
- The pseudo-element has its own `border` (not `outline`), which is part of the element's box model and renders fully on all four edges with the rounded radius applied.

Net result: the focus indicator renders as intended in every browser, including Chromium, and remains accessible to `:focus-visible` styling without DOM changes.

## Prevention

1. **For any focusable element with `overflow: hidden`, do not use `outline-offset: -Npx`.** Use the `::after` pseudo-element pattern above. The convention is portable enough to live in a design-system primitive (e.g., `<Tile />`, `<Card />`, `<Poster />`) so feature code never has to think about it.

2. **Establish the pattern at the design-system layer.** When adding focusable image-containing primitives, encode the focus-ring contract in the primitive's own CSS, not in each consumer's stylesheet. A consumer that re-implements focus styling with `outline` is the failure mode this bug surfaces.

3. **Test focus indicators visually, not just via computed styles.** A green typecheck and a passing axe contrast check will both pass with the broken `outline-offset` rule because the rule *is* present in computed CSS — the bug is in how the browser paints it. Visual verification (live screenshot or Storybook interaction test) is the only way to catch this class of bug. Adding a Storybook story that captures the focused state of every focusable design-system primitive turns the regression into a single screenshot diff.

4. **Prefer `border-radius: inherit` on the pseudo-element** so that future changes to the tile's radius don't silently desynchronize the focus ring's corners. If the design system uses tokens like `var(--radius-tile)`, the pseudo-element picks up the new value automatically.

5. **When the design calls for a "soft outer halo" around the focus ring, layer it on the pseudo-element as a second `box-shadow` rather than as an outer outline on the tile itself.** An outer outline or outer shadow on the tile is susceptible to clipping by *ancestor* `overflow: hidden` — for example, by a horizontal scroll rail. The pseudo-element approach keeps the entire focus indicator inside the tile's bounds where no ancestor can clip it.

## Related

- `korri/shared/design-system/explorations/home-screens/HomeSunlit.stories.tsx` — the file where this bug was discovered and fixed.
- `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx` — the rail container with `overflowY: hidden` that motivated the inset focus ring in the first place. An outer halo on the tile would be clipped by the rail; the pseudo-element approach is robust to both the tile's own `overflow: hidden` and the rail's.
- `docs/solutions/best-practices/backticks-in-scoped-css-template-literals-2026-05-01.md` — separate scoped-CSS foot-gun in the same exploration files; both bugs surface during design-system iteration on TSX-scoped styles.
- Chromium issue tracker has multiple reports of this clipping behavior; the spec ambiguity around outline rendering at negative offsets has not been resolved at the time of writing (2026-05).
