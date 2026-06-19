# Research: Runtime-Themeable Tailwind via CSS Custom Properties

## Summary

Tailwind v4's CSS-first `@theme` system exposes every token as a CSS variable, making runtime rescaling via a small set of "knob" variables genuinely practical. The `@theme` / `@theme inline` distinction is the critical split: regular `@theme` emits a global CSS variable (overridable at runtime) while `@theme inline` skips the intermediate variable and inlines the value directly into utility rules (used by shadcn/ui to bridge semantic `:root` vars to Tailwind utilities). Design-token pipelines (Style Dictionary + sd-tailwindv4) can automate the gap between DTCG token files and Tailwind `@theme` blocks.

---

## Findings

### 1. `@theme` vs `@theme inline` — the decisive difference

**`@theme` (default)**

```css
@theme {
  --color-primary: oklch(0.6 0.24 255);
}
```

- Emits `--color-primary: oklch(0.6 0.24 255)` inside `@layer theme :root`.
- Generated utility `bg-primary` compiles to `background-color: var(--color-primary)`.
- Because the CSS variable exists globally, it can be **overridden at runtime** from any more-specific selector or via `document.documentElement.style.setProperty`.
- `var()` references inside `@theme` values **do work**: `--color-bg-1: var(--bg-1)` is valid, and Tailwind passes the expression through to the emitted CSS variable.
- `calc(var(--knob))` inside a regular `@theme` value also passes through correctly; the browser resolves it at paint time.

[Source — Tailwind v4 blog](https://tailwindcss.com/blog/tailwindcss-v4)  
[Source — Stack Overflow override patterns](https://stackoverflow.com/questions/79691837/how-to-override-theme-variables-in-tailwindcss-v4-theme-vs-layer-theme-vs-root)  
[Source — Reddit multi-theme pattern with var()](https://www.reddit.com/r/tailwindcss/comments/1mzdt6s/how_to_have_multiple_themes_in_tailwind_v4/)

**`@theme inline`**

```css
@theme inline {
  --color-background: var(--background);
}
```

- Does **not** emit a `--color-background` CSS variable in `:root`. The variable namespace entry is consumed at build time.
- The value is inlined directly into each generated utility rule: `bg-background { background-color: var(--background) }`.
- Because there is no intermediate global variable, there is **nothing to override** via a parent selector on the `@layer theme` variable — you control the result by overriding the *source* variable (`--background`) in `:root`, `.dark`, etc.
- **Critical caveat:** `@theme inline { --x: calc(var(--knob) * 2); }` is **broken** as of v4.0.5 (open GitHub issue [#16396](https://github.com/tailwindlabs/tailwindcss/issues/16396)). Do not put `calc(var(...))` expressions directly inside `@theme inline`; pre-compute them in `:root` first.

[Source — shadcn/ui Tailwind v4 theming docs](https://ui.shadcn.com/docs/theming)  
[Source — GitHub issue #16396](https://github.com/tailwindlabs/tailwindcss/issues/16396)  
[Source — @theme inline discussion #18560](https://github.com/tailwindlabs/tailwindcss/discussions/18560)

---

### 2. `calc(var(--knob))` as a runtime multiplier — what works

The "one knob drives many tokens" pattern is viable with Tailwind v4. The safe implementation uses two layers:

**Step 1 — Pre-compute scaled tokens in `:root`**

```css
:root {
  /* Knobs — change at runtime via JS or user-pref logic */
  --text-scale: 1;   /* 1.2 for accessible / large-print mode */
  --density:    1;   /* 0.85 for compact, 1.2 for cozy */

  /* Fluid primitives (clamp-based, viewport-independent) */
  --_text-sm-base:   clamp(0.75rem,  0.75rem + 0.25cqi, 0.875rem);
  --_text-base-base: clamp(0.875rem, 1rem    + 0.5cqi,  1.125rem);
  --_text-lg-base:   clamp(1rem,     1.25rem + 0.5cqi,  1.5rem);
  --_pad-sm-base:    clamp(0.5rem,   0.75rem + 0.25cqi, 1rem);
  --_pad-md-base:    clamp(0.75rem,  1rem    + 0.5cqi,  1.5rem);

  /* Scaled semantic tokens */
  --text-sm-token:   calc(var(--_text-sm-base)   * var(--text-scale));
  --text-base-token: calc(var(--_text-base-base) * var(--text-scale));
  --text-lg-token:   calc(var(--_text-lg-base)   * var(--text-scale));
  --pad-sm-token:    calc(var(--_pad-sm-base)     * var(--density));
  --pad-md-token:    calc(var(--_pad-md-base)     * var(--density));
}
```

**Step 2 — Bridge to Tailwind utilities with `@theme inline`**

```css
@theme inline {
  /* Just var() references — no calc() here, avoids issue #16396 */
  --text-sm:       var(--text-sm-token);
  --text-base:     var(--text-base-token);
  --text-lg:       var(--text-lg-token);
  --spacing-sm:    var(--pad-sm-token);
  --spacing-md:    var(--pad-md-token);
}
```

**Runtime change (JS)**

```ts
// User selects "large text" preference
document.documentElement.style.setProperty("--text-scale", "1.25");
// User selects "compact" density
document.documentElement.style.setProperty("--density", "0.85");
```

**Alternative: skip `@theme inline`, use regular `@theme` with embedded `calc(var())`**

```css
/* This ALSO works — @theme (not inline) passes calc(var()) through */
@theme {
  --text-base: calc(clamp(0.875rem, 1rem + 0.5cqi, 1.125rem) * var(--text-scale, 1));
}
```

In this case Tailwind emits `--text-base: calc(...)` into `@layer theme :root`, and the browser resolves it live. Overriding `--text-scale` on any ancestor (including `:root`) immediately rescales all utilities.

> **Why the two-layer approach is preferred:** It keeps `@theme inline` safe from the calc-bug, makes it easy to override individual semantic tokens without touching Tailwind tokens, and separates primitive fluid values from the scale knob.

[Source — design.dev CSS variables guide](https://design.dev/guides/css-variables/)  
[Source — web.dev fluid typography baseline](https://web.dev/articles/baseline-in-action-fluid-type)  
[Source — "Atomic Hack" one-variable pattern](https://medium.com/@doriansotpyrc/the-atomic-hack-scale-your-entire-website-ui-with-5-lines-of-css-40754e655356)

---

### 3. shadcn/ui + Radix semantic color token pattern

shadcn/ui's Tailwind v4 migration demonstrates the canonical semantic-token approach:

```css
/* :root / .dark hold raw values — the "semantic layer" */
:root {
  --background:         oklch(1 0 0);
  --foreground:         oklch(0.145 0 0);
  --primary:            oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --muted:              oklch(0.97 0 0);
  --muted-foreground:   oklch(0.556 0 0);
  --radius:             0.625rem;
}

.dark {
  --background:         oklch(0.145 0 0);
  --foreground:         oklch(0.985 0 0);
  --primary:            oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
}

/* @theme inline bridges semantic vars → Tailwind utilities (no duplicate global var) */
@theme inline {
  --color-background:         var(--background);
  --color-foreground:         var(--foreground);
  --color-primary:            var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted:              var(--muted);
  --color-muted-foreground:   var(--muted-foreground);
  --radius-md:                var(--radius);
}
```

Key properties of this pattern:
- Colors are defined once as raw CSS variables; mode switching is just selector override (`.dark`, `[data-theme="high-contrast"]`).
- `@theme inline` means Tailwind utility classes (`bg-background`, `text-primary`, etc.) resolve directly to the `:root` variable at browser paint — no double indirection.
- Adding a density or base-size knob follows the same pattern: add a raw variable, override it per context, reference it from `@theme inline`.

For **density toggles on a TV/handheld surface** (this project's range), extend this with a `[data-density="compact"]` selector:

```css
[data-density="compact"] { --density: 0.85; }
[data-density="cozy"]    { --density: 1.2; }
```

[Source — shadcn/ui theming docs](https://ui.shadcn.com/docs/theming)  
[Source — shadcn/ui Tailwind v4 migration guide](https://ui.shadcn.com/docs/tailwind-v4)  
[Source — shadcndesign semantic color explanation](https://www.shadcndesign.com/blog/how-semantic-colors-work-in-shadcn-ui)

---

### 4. Design-token pipelines: DTCG → Style Dictionary → Tailwind v4 `@theme`

**W3C DTCG format** (2022 community group spec) uses `$value`, `$type`, and `$description` keys in JSON:

```json
{
  "color": {
    "primary": { "$value": "oklch(0.6 0.24 255)", "$type": "color" }
  },
  "spacing": {
    "md": { "$value": "1rem", "$type": "dimension" }
  }
}
```

**Style Dictionary v4** supports DTCG natively. It transforms token files into multiple output formats.

**tokens-studio/sd-tailwindv4** is the dedicated Style Dictionary plugin for Tailwind v4 `@theme` output:

```js
// build.js
import StyleDictionary from "style-dictionary";
import { createTailwindV4Plugin } from "sd-tailwindv4";

StyleDictionary.registerFormat({
  name: "tailwind-v4",
  format: createTailwindV4Plugin({
    themeSelectors: {
      light: ":root",
      dark:  '[data-theme="dark"]',
    },
  }),
});
```

Output pattern:

```css
@import 'tailwindcss';

@theme {
  --color-brand-primary: oklch(0.570 0.191 248.32);
  --spacing-4: 1rem;
}

@layer base {
  [data-theme="dark"] {
    --color-theme-background: #000000;
  }
}
```

The workflow: Figma → Tokens Studio Figma plugin → DTCG JSON → Style Dictionary transform → Tailwind `@theme` CSS. Generated files are read-only; regenerate via the build script.

[Source — tokens-studio/sd-tailwindv4 GitHub](https://github.com/tokens-studio/sd-tailwindv4)  
[Source — Style Dictionary DTCG docs](https://styledictionary.com/info/dtcg/)  
[Source — DEV Community: typesafe tokens in Tailwind 4](https://dev.to/wearethreebears/exploring-typesafe-design-tokens-in-tailwind-4-372d)

---

### 5. Accessibility / user-preference scaling

The browser already scales text when the user adjusts OS font size, **if** font sizes use `rem` (relative to the root font-size, which respects browser/OS preferences). A runtime multiplier on top of `rem`-based tokens is additive — it lets the *app* offer a user preference distinct from OS-level zoom.

Recommended pattern for a handheld-to-TV app:

```css
:root { --text-scale: 1; }

/* Respect OS-level "larger text" preference as a starting point */
@media (prefers-contrast: more) {
  :root { --text-scale: 1.15; }
}

/* App-level preference (JS-driven) stacks on top */
/* document.documentElement.style.setProperty('--text-scale', '1.3') */
```

**Using `em` in `clamp()` min/max** (per web.dev baseline guidance) ensures that even fluid clamped values respect browser font-size zoom. `vw`-based fluid fluid values can resist zoom; mitigate by keeping the viewport unit contribution small.

[Source — web.dev fluid typography + user prefs](https://web.dev/articles/baseline-in-action-fluid-type)  
[Source — DEV Community responsive typography methods](https://dev.to/laurilllll/how-to-create-responsive-typography-using-css-three-different-methods-explained-50f8)

---

## Recommended Wiring for This Project

Given the stack (Tailwind v4, small-handheld → TV range, fluid design with `cqi` units, Korri theme layer):

```css
/* ─── Knobs (runtime-adjustable) ─────────────────────────────── */
:root {
  --text-scale: 1;     /* 1.25 for a11y large-text mode */
  --density:    1;     /* 0.85 compact / 1.2 cozy */
  --base-hue:   255;   /* brand rotate: oklch(0.6 0.24 var(--base-hue)) */
}

/* ─── Primitive scale (fluid, not scaled by knobs) ────────────── */
:root {
  --_sz-xs:  clamp(0.625rem, 0.6rem  + 0.3cqi, 0.75rem);
  --_sz-sm:  clamp(0.75rem,  0.75rem + 0.3cqi, 0.875rem);
  --_sz-md:  clamp(0.875rem, 1rem    + 0.5cqi, 1.125rem);
  --_sz-lg:  clamp(1rem,     1.25rem + 0.5cqi, 1.5rem);
  --_sz-xl:  clamp(1.25rem,  1.75rem + 0.5cqi, 2.25rem);

  --_sp-xs:  clamp(0.25rem,  0.5rem  + 0.25cqi, 0.5rem);
  --_sp-sm:  clamp(0.5rem,   0.75rem + 0.25cqi, 1rem);
  --_sp-md:  clamp(0.75rem,  1rem    + 0.5cqi,  1.5rem);
  --_sp-lg:  clamp(1.25rem,  2rem    + 0.5cqi,  3rem);
}

/* ─── Semantic tokens (knob-scaled) ──────────────────────────── */
:root {
  /* typography scaled by --text-scale */
  --text-xs-tok:  calc(var(--_sz-xs)  * var(--text-scale));
  --text-sm-tok:  calc(var(--_sz-sm)  * var(--text-scale));
  --text-md-tok:  calc(var(--_sz-md)  * var(--text-scale));
  --text-lg-tok:  calc(var(--_sz-lg)  * var(--text-scale));
  --text-xl-tok:  calc(var(--_sz-xl)  * var(--text-scale));

  /* spacing scaled by --density */
  --sp-xs-tok:    calc(var(--_sp-xs)  * var(--density));
  --sp-sm-tok:    calc(var(--_sp-sm)  * var(--density));
  --sp-md-tok:    calc(var(--_sp-md)  * var(--density));
  --sp-lg-tok:    calc(var(--_sp-lg)  * var(--density));

  /* colors — raw semantic values, overridden per theme */
  --bg:           oklch(0.08 0.02 var(--base-hue));
  --fg:           oklch(0.96 0.01 var(--base-hue));
  --brand:        oklch(0.60 0.24 var(--base-hue));
  --brand-fg:     oklch(0.99 0    0);
  --surface:      oklch(0.13 0.02 var(--base-hue));
  --border:       oklch(0.25 0.02 var(--base-hue));
}

/* ─── Theme overrides (e.g. high-contrast, alternate brand) ───── */
[data-theme="high-contrast"] {
  --fg:           oklch(1 0 0);
  --bg:           oklch(0 0 0);
  --text-scale:   1.15;
}

[data-density="compact"] { --density: 0.85; }
[data-density="cozy"]    { --density: 1.2;  }

/* ─── Tailwind utilities (inline = reference pre-computed vars) ── */
@theme inline {
  /* Typography */
  --text-xs:     var(--text-xs-tok);
  --text-sm:     var(--text-sm-tok);
  --text-base:   var(--text-md-tok);
  --text-lg:     var(--text-lg-tok);
  --text-xl:     var(--text-xl-tok);

  /* Spacing (overrides Tailwind defaults for named steps) */
  --spacing-xs:  var(--sp-xs-tok);
  --spacing-sm:  var(--sp-sm-tok);
  --spacing-md:  var(--sp-md-tok);
  --spacing-lg:  var(--sp-lg-tok);

  /* Semantic colors */
  --color-bg:         var(--bg);
  --color-fg:         var(--fg);
  --color-brand:      var(--brand);
  --color-brand-fg:   var(--brand-fg);
  --color-surface:    var(--surface);
  --color-border:     var(--border);
}
```

**Runtime JS knob setter:**

```ts
const setThemeKnob = (
  knob: "--text-scale" | "--density" | "--base-hue",
  value: string
) => document.documentElement.style.setProperty(knob, value);
```

---

## Explicit Caveats

| Situation | Status |
|---|---|
| `@theme { --x: calc(var(--knob) * 1rem); }` | ✅ Works — Tailwind emits the `calc(var())` expression as-is into the CSS variable |
| `@theme inline { --x: var(--precomputed); }` | ✅ Works — inlines the `var()` reference into each utility rule |
| `@theme inline { --x: calc(var(--knob) * 1rem); }` | ❌ **Broken** as of v4.0.5 — GitHub issue #16396, open as of 2025-02-10 |
| Overriding `@theme` variables at runtime via JS `setProperty` | ✅ Works — override the CSS variable Tailwind emitted, not the theme declaration |
| Overriding `@theme inline` variables at runtime via JS | ❌ No global variable exists; override the *source* variable in `:root` instead |
| `@media (width > var(--breakpoint-md))` | ❌ CSS media queries cannot use `var()` — use static breakpoint values |
| `var(--spacing-2)` inside another `@theme` value | ⚠️ Fragile — referencing Tailwind's own generated token variables in `@theme` is not officially supported; use `calc(var(--spacing) * 2)` instead |
| `clamp()` with `em` units respects user OS font zoom | ✅ Preferred for a11y |
| `clamp()` with `vw`/`cqi` resists OS font zoom | ⚠️ Keep viewport-unit contribution small; use `em`-based min/max |

---

## Sources

### Kept
- **Tailwind CSS v4.0 blog post** (tailwindcss.com/blog/tailwindcss-v4) — authoritative feature description
- **Tailwind v4 Theme Variables docs** (tailwindcss.com/docs/theme) — canonical @theme / :root guidance
- **GitHub issue #16396** (tailwindlabs/tailwindcss) — confirmed `@theme inline` + `calc(var())` bug
- **GitHub discussion #18560** (tailwindlabs/tailwindcss) — `@theme inline` vs `@theme` semantics
- **GitHub issue #15874** (tailwindlabs/tailwindcss) — CSS variable inheritance edge cases
- **shadcn/ui theming docs** (ui.shadcn.com/docs/theming) — canonical semantic token + `@theme inline` pattern
- **shadcn/ui Tailwind v4 migration** (ui.shadcn.com/docs/tailwind-v4) — shows `@theme inline` in practice
- **tokens-studio/sd-tailwindv4** (github.com/tokens-studio/sd-tailwindv4) — DTCG → Tailwind v4 @theme pipeline
- **Style Dictionary DTCG docs** (styledictionary.com/info/dtcg/) — authoritative token format spec
- **web.dev fluid typography baseline** (web.dev/articles/baseline-in-action-fluid-type) — a11y + em + clamp guidance
- **"Atomic Hack" Medium post** (medium.com/@doriansotpyrc) — one-var drives all pattern
- **Stack Overflow: override theme vars in v4** — practical override patterns
- **Reddit multi-theme with var()** — confirmed var() in @theme values pattern

### Dropped
- SEO blog posts restating docs without new evidence (Mavik Labs, SeedFlip, Flagrant) — used for corroboration only, not primary
- tailwind-clamp plugin GitHub — interesting but a third-party plugin adding complexity not needed when native `calc()`+`clamp()` suffice

---

## Gaps

1. **Issue #16396 resolution status** — it was filed 2025-02-10 and marked "needs reproduction". No confirmed fix or workaround from the Tailwind team at research time. Monitor the issue before relying on `calc(var())` inside `@theme inline`.
2. **`var(--base-hue)` in `oklch()` tokens** — the pattern `oklch(0.6 0.24 var(--base-hue))` works in raw CSS but its behavior inside `@theme inline` depends on the same var-reference support. Test in the target Tailwind build.
3. **`@property` registration** — for the multiplier knobs (`--text-scale`, `--density`) to inherit reliably and animate, registering them with `@property { syntax: "<number>"; inherits: true; initial-value: 1; }` is best practice. Not researched in depth here.
4. **Container-query unit (`cqi`) in `clamp()`** — `cqi` requires a `container-type` ancestor. The prototype uses this; verify that the `@theme inline` spacing tokens that use `cqi`-based values resolve correctly in all component mounting contexts.
