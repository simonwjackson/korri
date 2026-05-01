---
title: Backticks in CSS comments break JSX <style> template literals (TS1381)
date: 2026-05-01
category: build-errors
module: korri/shared/design-system + any TSX file using <style>{`...`}</style>
problem_type: build_error
component: tooling
symptoms:
  - "TypeScript: error TS1381: Unexpected token. Did you mean `{'}'}` or `&rbrace;`?"
  - "Errors point at the closing </style> tag (or far below it), not at the actual broken character"
  - "Cascading TS1005 / TS1381 errors that start near a CSS comment and bottom out at the closing JSX tag"
  - "File parsed fine before a CSS comment was added that references a selector or class name in Markdown-style backticks"
  - "Storybook / Vite build fails with the same parser error on the same file"
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - frontend_stimulus
  - testing_framework
tags:
  - typescript
  - jsx
  - template-literals
  - css-in-js
  - scoped-styles
  - storybook
  - parser-error
  - foot-gun
---

# Backticks in CSS comments break JSX `<style>` template literals (TS1381)

## Problem

When using a scoped `<style>{`…`}</style>` block in a TSX file (a common React pattern for variant-scoped CSS), any backtick character inside the template literal — including inside `/* … */` CSS comments — terminates the template early. The TypeScript / Babel parser then reads the remainder of the file as malformed JSX and emits cascading `TS1381` and `TS1005` errors that point at the closing tag, not at the actual broken character.

This is especially easy to walk into because Markdown-style backticks read naturally in CSS comments that reference selectors:

```ts
<style>{`
  /* The `.hud-glyph` class is contributed by HudButtons and …  */
  …
`}</style>
```

The parser sees the first backtick inside the comment as the *closing* delimiter of the template literal, leaving everything that follows in JSX context.

## Symptoms

- `error TS1381: Unexpected token. Did you mean '{'}'}' or '&rbrace;'?`
- The reported line/column is the file's closing `</style>` tag (or even further down — the next JSX element), tens or hundreds of lines below the offending backtick.
- Running `tsc` directly on the file shows dozens of cascading `TS1005 '}' expected.` and `TS1381 Unexpected token` pairs starting near the CSS comment.
- The file parsed cleanly until a comment was added that wraps a selector, class name, or component name in Markdown-style backticks.
- IDE syntax highlighting may *not* show the issue because most editors highlight the rest of the template as a string regardless — the bug only surfaces at parse time.

## What Didn't Work

- **Looking at the line tsc points to.** It's always the closing JSX tag of the `<style>` element (or the next sibling). The actual problem is wherever the first stray backtick appears earlier in the template.
- **Counting braces or reformatting.** The file's braces are balanced; the formatter has no reason to flag this.
- **Restoring from git.** Resolves the symptom but loses the comment edit you wanted; the next person hits the same wall.

## Solution

Remove backticks from anywhere inside a JSX `<style>{`…`}</style>` template literal — including inside `/* … */` comments. Use plain text references to selectors:

```ts
// BROKEN — the first backtick in the comment ends the template literal
<style>{`
  /* The \`.hud-glyph\` class is contributed by HudButtons and … */
  [data-exploration="sunlit"] .hud-glyph { … }
`}</style>

// WORKS — same intent, no backticks
<style>{`
  /* The .hud-glyph class is contributed by HudButtons and … */
  [data-exploration="sunlit"] .hud-glyph { … }
`}</style>
```

If you genuinely need to mark a token as code-like in a comment, use CSS-comfortable conventions — the unadorned selector (`.hud-glyph`), an HTML-style angle quote (`<HudButtons>` reads fine in a CSS comment because it's just text), or a single-quote pair (`'class hook'`).

For the `${}` interpolation cousin: `${expr}` *does* interpolate inside scoped-style templates, so anything that looks like `$` followed by `{` will try to evaluate. Avoid both characters in close proximity unless interpolation is what you want. (This is a separate, more obvious failure — interpolation errors complain at the `${`, not the closing tag.)

## Why This Works

A JS template literal uses backticks (`` ` ``) as delimiters. Inside the template, `${ … }` is special (interpolation), and the closing backtick ends the literal. The parser does *not* understand that the backtick is "inside a CSS comment" — it's just text from the parser's point of view, and the first backtick wins.

Once the literal terminates early, the rest of the file (the CSS that should have been the template's content, plus the closing `}</style>` and everything after) is parsed as raw JSX. JSX expressions cannot contain stray `}` characters, so the parser emits `TS1381 Unexpected token. Did you mean '{'}'}' …?` at every `}` it finds. The reported line is wherever the parser finally gives up, which is usually the closing JSX tag — far from the actual cause.

The fix is to never put a backtick in the template literal that wasn't intended as a delimiter.

## Prevention

1. **Convention: backticks are forbidden inside `<style>{`…`}</style>` templates** — including in CSS comments. When referencing a class or selector in a comment, write it plain (`.hud-glyph`), not in backtick-quoted form.

2. **When typecheck reports `TS1381` near a closing `</style>` tag, search the file for stray backticks first** — `grep -n '`' file.tsx`. The actual cause is the *first* backtick after the opening backtick of the template, not where the parser flagged.

3. **Add a comment to scoped-style files documenting the rule** so the next contributor doesn't repeat the mistake. Example top-of-file note:

   ```ts
   /**
    * Scoped CSS lives inside a tagged template literal. Backticks
    * inside the template (including inside CSS comments) terminate
    * the literal early and cascade into TS1381 parser errors at the
    * closing </style> tag. Use plain text for selector references in
    * comments — `.foo` style markdown breaks the parser.
    */
   ```

4. **Consider CSS Modules or a `css` tagged-template helper** (e.g., `styled-components`, `vanilla-extract`, or `emotion`'s `css` macro) for projects where scoped CSS is widespread. Those approaches have their own trade-offs but eliminate this specific foot-gun. For exploration / story-local CSS where scoped `<style>` is the right level of overhead, the convention above is sufficient.

5. **A future Biome rule could flag this.** Biome doesn't currently catch backticks inside JSX template-literal children. If you find this bug worth catching in lint, file or write a `noBacktickInJsxStyleTemplate` rule. Until then, convention + the typecheck reflex above is the guardrail.

## Related

- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` — establishes scoped `<style>` blocks as the project pattern for variant-specific tokens (where this bug is most likely to bite).
- `korri/shared/design-system/explorations/home-screens/HomeSunlit.stories.tsx` — the canonical example of the scoped-style pattern; this file hit the bug twice in one session, once in a comment referencing `<HudButtons>` and once in a comment referencing `` `rounded-sm` ``.
- `korri/shared/design-system/explorations/home-screens/HomeHero.stories.tsx`, `HomeMosaic.stories.tsx` — same scoped-style pattern, same risk surface.
