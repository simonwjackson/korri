# Research: Utility-Class Granularity — Tailwind + Generative Design-Token Systems

## Summary

Tailwind's core thesis is that utility classes are *not* inline styles because they operate on a
finite, curated scale — the **theme is the constraint**. The tension with a "few knobs, many derived
values" philosophy is real but resolvable: Tailwind v4's `@theme` block exposes every token as a
native CSS variable, making it possible to layer a generative scale on top while retaining utility
classes as the consumption surface. The consensus pattern is a **three-tier token hierarchy**
(base/primitive → semantic → component) enforced by linting, with component boundaries set at
repeated *behaviour*, not repeated *appearance*.

---

## Findings

### 1 — Utilities are only as good as the scale they map to

**The constrained-scale thesis (Adam Wathan)** — Tailwind's homepage has always framed utility
classes as "An API for your design system. Utility classes help you work within the constraints of a
system instead of littering your stylesheets with arbitrary values." The critical word is
*constraints*: a scale with 10 spacing steps and 8 type sizes is itself the design system. The
difference from inline styles is not syntax, it is the closed vocabulary. [Tailwind CSS v3 homepage
— "An API for your design system"](https://v3.tailwindcss.com/)

**Arbitrary values break the contract** — Tailwind's bracket syntax (`p-[13px]`, `text-[10px]`)
exists for escape hatches, but using it routinely undoes the scale guarantee. The official docs say
"this is basically like inline styles" and recommend it only when you need something pixel-perfect
that the scale cannot express. [Tailwind docs — Adding custom
styles](https://tailwindcss.com/docs/adding-custom-styles)

**Lint enforcement** — `eslint-plugin-tailwindcss` ships a `no-arbitrary-value` rule (off by
default) that hard-bans bracket syntax across a codebase. Pairing this with a well-defined `@theme`
means any value not in the scale is a lint error rather than a silent design debt. The
`no-unnecessary-arbitrary-value` sibling rule converts brackets back to named utilities when a theme
token already matches. [eslint-plugin-tailwindcss —
npm](https://www.npmjs.com/package/eslint-plugin-tailwindcss) / [Rule
docs](https://github.com/francoismassart/eslint-plugin-tailwindcss/blob/HEAD/docs/rules/no-arbitrary-value.md)

---

### 2 — Tailwind v4 `@theme`: semantic aliases as first-class citizens

**CSS-first token definition** — Tailwind v4 replaces `tailwind.config.js` theme keys with a CSS
`@theme {}` block. Variables declared there are simultaneously CSS custom properties *and* utility
generators:

```css
@theme {
  /* Primitive / base tokens */
  --color-neutral-900: oklch(0.18 0.01 260);
  --space-4: 1rem;

  /* Semantic aliases → utilities are auto-generated */
  --color-surface:   var(--color-neutral-900);
  --color-on-surface: oklch(0.95 0 0);
  --text-body:       1rem;
  --text-body--line-height: 1.6;
  --space-inline:    var(--space-4);
}
```

This produces `bg-surface`, `text-on-surface`, `text-body`, `p-inline`, etc. as real Tailwind
utilities — no `@layer components` hack needed. [Tailwind CSS v4.0 release
post](https://tailwindcss.com/blog/tailwindcss-v4) / [Theme variables
docs](https://tailwindcss.com/docs/theme)

**Runtime token swapping without a rebuild** — Because `@theme` variables are native CSS custom
properties on `:root`, they can be overridden at runtime via attribute selectors:

```css
[data-theme="brand-dark"] {
  --color-surface: oklch(0.12 0.015 260);
  --color-primary: oklch(0.72 0.18 145);
}
```

No Tailwind rebuild, no JS bundle change. [Tailwind v4 — runtime theming via data-theme
(Medium)](https://medium.com/@sir.raminyavari/theming-in-tailwind-css-v4-support-multiple-color-schemes-and-dark-mode-ba97aead5c14)

**The `@apply` debate** — Adam Wathan has repeatedly warned against `@apply` for anything that maps
1-to-1 with a component template: it reintroduces the "naming things" problem and the indirection of
BEM without the benefits. His guidance: *extract a component (JSX/template), not a CSS class*. The
Tailwind docs echo this — `@apply` is appropriate only when you cannot add classes to the markup
(e.g. third-party HTML, markdown output). [Tailwind docs — Reusing
Styles](https://v3.tailwindcss.com/docs/reusing-styles) / [Extracting
Components](https://v1.tailwindcss.com/docs/extracting-components)

**When to extract a React component instead** — the rule of thumb from the Tailwind ecosystem:
extract a component when you need to change *behaviour* (event handlers, state) or when the same
class string appears in more than one file and diverging would be a bug. Do not extract for
appearance alone. A `<Button variant="primary">` React component is the correct boundary; a
`.btn-primary {}` CSS class is not.

---

### 3 — Real-world critiques and alternatives

**"Utility sprawl" critique** — The most common complaint is that a large component can accumulate
30–50 class names, making diffs and code review painful. Documented patterns to manage this:
class-variance-authority (CVA) gathers variant permutations into a typed map rather than ternary
chains; `tailwind-merge` (twMerge) handles conflict resolution. shadcn/ui's component library is
built on both. [Advanced Tailwind v4 Patterns — JavaScript in Plain
English](https://javascript.plainenglish.io/advanced-tailwind-v4-patterns-for-complex-applications-bd1f5d49ba0d)

**shadcn/ui semantic-token model** — shadcn exposes a small set of semantic tokens (`--background`,
`--foreground`, `--primary`, `--primary-foreground`, `--muted`, `--destructive`, …) as CSS
variables, then maps them into Tailwind's theme so utilities like `bg-primary` and `text-muted` map
to semantics, not palette literals. This is the practical instantiation of "few knobs, many derived
values": change `--primary` once and every component using `bg-primary`, `text-primary`,
`ring-primary` updates. [shadcn/ui Theming
docs](https://ui.shadcn.com/docs/theming) / [Scalable design system with
shadcn](https://shadisbaih.medium.com/building-a-scalable-design-system-with-shadcn-ui-tailwind-css-and-design-tokens-031474b03690)

**CUBE CSS (Andy Bell)** — CUBE treats utility classes as the "U" layer — they apply single-property
token values to *any element* without semantic naming. Andy Bell has explicitly used Tailwind as the
utility generator for CUBE's U layer: "I managed to roll-out a little generator that takes Tailwind
config groups and generates CSS Custom Properties." The rest of CUBE (Composition, Block, Exception)
carries context and semantic meaning; utilities carry only atomic token application. This separates
concerns cleanly: Tailwind generates the utilities from tokens, CUBE determines when to apply them.
[CUBE CSS — Andy Bell](https://cube.fyi/) / [I used Tailwind for the U in CUBE
CSS](https://bell.bz/i-used-tailwind-for-the-u-in-cube-css-and-i-liked-it/) / [Piccalilli — CUBE
CSS](https://piccalil.li/blog/cube-css/)

**Open Props** — Adam Argyle's Open Props takes the opposite approach: publish a comprehensive set of
CSS custom properties (props) that you consume directly in vanilla CSS, skipping utility class
generation entirely. It is explicitly "Tailwind but with CSS variables" in motivation. The tradeoff:
more expressive, no purging, no class-name constraint. Useful as a reference for what a generative
scale looks like when externalised as tokens, and several CUBE practitioners use Open Props as their
token source, then generate CUBE utilities from those props. [Open Props](https://open-props.style/)
/ [CSS-Tricks — Open Props and Custom Properties as a
System](https://css-tricks.com/open-props-and-custom-properties-as-a-system/)

**"Utilities are just inline styles" counterargument and rebuttal** — Critics argue utility classes
are just inline styles with extra steps. The substantive rebuttals from the Tailwind community:
(a) utilities draw from a *finite, named scale* — you pick from options, you don't invent values;
(b) utilities compose with state variants (`hover:`, `focus:`, `dark:`, `lg:`) which inline styles
cannot; (c) utilities are purgeable, inline styles are not. The critique has force when arbitrary
bracket values are used freely — that is functionally identical to inline styles. The fix is the same
as above: ban arbitrary values and enforce the scale. [Tailwind docs — Styling with utility
classes](https://tailwindcss.com/docs/styling-with-utility-classes)

**Semantic CSS counterdata** — Piccalilli links a study claiming semantic CSS is measurably better
across several axes. The data is contested and the methodology is disputed in the community, but it
is a fair reminder that utility-first requires discipline to yield its alleged benefits. [Piccalilli —
Tailwind vs. Semantic CSS](https://piccalil.li/links/tailwind-vs-semantic-css/)

---

### 4 — Runtime "knobs": scaling a whole utility family at once

**The rem base trick** — Because Tailwind's default scale uses `rem` units, a single override of
`html { font-size: N; }` (or a `--base-size` custom property) scales every `text-*`, `p-*`, `m-*`,
`gap-*`, etc. that was defined in rem uniformly. This is the global density knob: set
`font-size: 14px` for compact mode, `font-size: 16px` for default. Caveats: it scales *everything*
including things you may not want to scale (1px hairlines should use px, not rem). [Stack Overflow —
Responsive Tailwind via root font
size](https://stackoverflow.com/questions/71704611/responsive-tailwind-css-by-updating-root-font-size-thus-rem-based-on-media-q)
/ [tailwindcss-base-font-size plugin](https://github.com/CedericPrivat/tailwindcss-base-font-size)

**Fluid scaling with `clamp()`** — Fluid Tailwind (`fluid.tw`) and `tailwind-clamp` plugins expose a
`~` modifier syntax so each utility can declare a min/max pair:
`text-~[sm,xl]` → `font-size: clamp(0.875rem, fluid, 1.25rem)`. This is per-step fluid, not
per-family. For a fully generative approach, define `@theme` tokens using `clamp()` directly:

```css
@theme {
  --text-body: clamp(0.9375rem, 0.875rem + 0.3125vw, 1.0625rem);
  --text-display: clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem);
  --space-section: clamp(2rem, 1.5rem + 2.5vw, 4rem);
}
```

Now `text-body` and `p-section` automatically adapt; no `md:text-lg` breakpoint classes needed.
[fluid.tw](https://fluid.tw/) / [Hoverify — Fluid Typography with Tailwind and
clamp](https://tryhoverify.com/blog/fluid-typography-tricks-scaling-text-seamlessly-across-devices-with-tailwind-and-css-clamp/)

**Multiple named knobs as CSS variables** — The generative-scale philosophy translates directly into
a small set of CSS variables that drive the whole system. A practical set of ~6 knobs for a TV/
handheld app:

```css
:root {
  --scale-base:     16px;   /* root em → rem base; drives all rem utilities */
  --scale-type:     1.25;   /* type modular ratio; used when computing --text-* steps */
  --scale-space:    1.0;    /* space multiplier; multiply each --space-* at definition */
  --density:        normal; /* maps to a data-density attribute selector */
  --radius-base:    0.5rem; /* all --radius-* derived from this */
  --color-primary-h: 220;   /* HSL hue; saturation/lightness derived via calc() */
}

/* Compact density override */
[data-density="compact"] {
  --scale-base: 14px;
  --scale-space: 0.85;
}
```

Then in `@theme`:
```css
@theme {
  --text-body: calc(1rem * var(--scale-base) / 16px);  /* proportional */
  --space-4: calc(1rem * var(--scale-space));
}
```

This keeps every utility consuming a named token while exposing only the knobs that matter.
[Tailwind v4 @theme: The Future of Design Tokens (Medium)](https://medium.com/@sureshdotariya/tailwind-css-4-theme-the-future-of-design-tokens-at-2025-guide-48305a26af06)
/ [Design Tokens That Scale in 2026 — Mavik Labs](https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/)

---

## Recommended Pattern: 5–7 Generator Knobs + Tailwind Utilities

```
1. --base-size          (rem root, controls all rem-based utilities)
2. --type-ratio         (modular scale ratio; applied at @theme definition time via calc)
3. --space-unit         (base spacing unit; all --space-* derived)
4. --color-brand-hue    (primary hue; lightness/chroma derived via oklch/calc)
5. --radius-base        (all corner radii derived)
6. --density            (maps to selector that overrides knobs 1–3 proportionally)
7. --motion-scale       (0 = reduced motion, 1 = full; multiplies transition durations)
```

Each knob lives in `:root`. Each `@theme` token is defined as a `calc()` or `var()` expression
referencing exactly one knob. Utility classes (`text-body`, `p-4`, `gap-section`) consume `@theme`
tokens. Component code never reads knobs directly — only `@theme` tokens. Arbitrary bracket values
are banned via `eslint-plugin-tailwindcss/no-arbitrary-value`. React component boundaries are drawn
at repeated *behaviour*, not repeated appearance — appearance repetition is fine when utilities are
short and the markup is a single file.

---

## Sources

### Kept

- **Tailwind CSS docs — Styling with utility classes** (https://tailwindcss.com/docs/styling-with-utility-classes) — primary source for the inline-styles distinction and constraint thesis
- **Tailwind CSS docs — Adding custom styles** (https://tailwindcss.com/docs/adding-custom-styles) — canonical guidance on arbitrary values and when they are appropriate
- **Tailwind CSS docs — Theme variables** (https://tailwindcss.com/docs/theme) — v4 `@theme` reference
- **Tailwind CSS v4.0 blog post** (https://tailwindcss.com/blog/tailwindcss-v4) — CSS-first, runtime variable exposure
- **Tailwind CSS docs — Reusing Styles (v3)** (https://v3.tailwindcss.com/docs/reusing-styles) — @apply guidance
- **eslint-plugin-tailwindcss** (https://github.com/francoismassart/eslint-plugin-tailwindcss) — no-arbitrary-value enforcement
- **CUBE CSS** (https://cube.fyi/) — Andy Bell's token-utility methodology
- **Andy Bell — I used Tailwind for the U in CUBE CSS** (https://bell.bz/i-used-tailwind-for-the-u-in-cube-css-and-i-liked-it/) — pragmatic integration
- **Piccalilli — CUBE CSS** (https://piccalil.li/blog/cube-css/) — design token + utility methodology
- **Piccalilli — What are design tokens** (https://piccalil.li/blog/what-are-design-tokens/)
- **Open Props** (https://open-props.style/) — generative token reference
- **CSS-Tricks — Open Props and Custom Properties as a System** (https://css-tricks.com/open-props-and-custom-properties-as-a-system/)
- **shadcn/ui Theming docs** (https://ui.shadcn.com/docs/theming) — semantic token model in practice
- **Scalable design system with shadcn/ui** (https://shadisbaih.medium.com/building-a-scalable-design-system-with-shadcn-ui-tailwind-css-and-design-tokens-031474b03690)
- **Tailwind v4 @theme guide** (https://medium.com/@sureshdotariya/tailwind-css-4-theme-the-future-of-design-tokens-at-2025-guide-48305a26af06) — practical token hierarchy examples
- **Design Tokens That Scale in 2026** (https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/) — three-tier hierarchy recommendation
- **Advanced Tailwind v4 Patterns** (https://javascript.plainenglish.io/advanced-tailwind-v4-patterns-for-complex-applications-bd1f5d49ba0d) — component-token pattern with CVA
- **fluid.tw** (https://fluid.tw/) — fluid utility plugin
- **Hoverify — Fluid Typography with Tailwind** (https://tryhoverify.com/blog/fluid-typography-tricks-scaling-text-seamlessly-across-devices-with-tailwind-and-css-clamp/)
- **tailwindcss-base-font-size plugin** (https://github.com/CedericPrivat/tailwindcss-base-font-size) — global rem scale knob
- **Tailwind v4 runtime theming** (https://medium.com/@sir.raminyavari/theming-in-tailwind-css-v4-support-multiple-color-schemes-and-dark-mode-ba97aead5c14)
- **Piccalilli — Tailwind vs. Semantic CSS** (https://piccalil.li/links/tailwind-vs-semantic-css/) — dissenting data

### Dropped

- Various SEO-farm "Tailwind vs CSS" comparison posts — no concrete technical content
- GeeksforGeeks font-size customisation article — too basic, no system-level insight
- digitalbiztalk.com inline-styles article — thin content, mostly restatement

---

## Gaps

1. **Adam Wathan's direct 2023–2025 position on semantic utilities in v4** — his blog/Twitter comments
   on `@theme`-as-semantic-layer have not been consolidated into a single canonical post; the guidance
   is scattered across conference talks (Rails World 2023) and GitHub discussions. Worth checking
   https://adamwathan.me or the Tailwind Labs GitHub discussions directly.

2. **Benchmarks on class-count vs file size** — no hard data found on whether 40-class markup is
   slower to parse than 4-class + `@apply`. This is unlikely to matter at current browser speeds but
   the claim circulates without citation.

3. **Tailwind v4 `calc()` in `@theme` — runtime vs build-time evaluation** — whether expressions like
   `calc(var(--scale-base) * var(--type-ratio))` inside `@theme` are evaluated at build time (static)
   or remain live CSS variables at runtime needs verification against the v4 spec. If evaluated at
   build time, the "few knobs" pattern requires defining tokens as raw CSS-variable chains rather than
   calc expressions.

4. **Korri-specific constraint** — the codebase uses container queries (`cqi` units) and targets TV +
   handheld simultaneously. How `clamp()` vw-based fluid scaling interacts with container-relative
   layout (where `cqi` is the relevant unit, not `vw`) needs a small prototype to confirm the
   recommended fluid-token pattern works as expected before committing to it.
