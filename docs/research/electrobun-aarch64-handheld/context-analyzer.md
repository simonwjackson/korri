# Context Analyzer — Electrobun on aarch64 EmuELEC handheld

## 1. Track classification and `problem_type` recommendation

**Track:** Knowledge (confirmed by prompt).

**Recommended `problem_type`: `best_practice`.**

Argument between `best_practice` and `architecture_pattern`:

- `architecture_pattern` would fit a *structural* decision — e.g. "kiosk renderer
  ownership lives in sessiond, not the compositor," or "Roots own state and
  composition roots pick the data strategy." It describes how a system is
  *arranged*, independent of any one tool.
- What we actually solved is a *concrete recipe* for getting one specific
  framework (Electrobun) to render on one specific class of target (aarch64
  EmuELEC / Rocknix-style stock OS, glibc 2.31, no usable `/nix`, ~970 MB RAM,
  Mali-G31, cage compositor). The artifact is a layered bring-up procedure —
  ext4 SD overlay → cohesive nixpkgs-24.05 closure → official Electrobun
  aarch64 prebuilts → `ld-linux` re-exec wrapper for `bin/bun` → disciplined
  `LD_LIBRARY_PATH` scoping → cage wrapper that unsets `LD_LIBRARY_PATH` before
  exec. That is a "here is how to make X work on Y" reusable recipe, not a
  generalized arrangement principle.
- Existing repo precedent agrees: the sibling docs
  `docs/solutions/best-practices/korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27.md`
  and `wayland-userspace-on-mali-g31-handheld-via-newer-libmali-2026-05-27.md`
  are the same shape — same device, same closure-overlay theme — and are
  classified as `best_practice`. Consistency with that local precedent matters.
- `best_practice` is also the documented fallback per the schema when no
  narrower knowledge-track value fits, and the narrower candidates
  (`convention`, `design_pattern`, `tooling_decision`, `workflow_issue`,
  `developer_experience`) all describe smaller-grained things than this
  multi-layer bring-up.

So: `best_practice`.

## 2. Suggested filename

`electrobun-aarch64-handheld-via-bwrap-nix-closure-2026-05-27.md`

Slug (`electrobun-aarch64-handheld-via-bwrap-nix-closure`) is 51 characters,
well under the 70-char limit, and parallels the existing
`korri-api-on-aarch64-handheld-via-bun-bundle` and
`wayland-userspace-on-mali-g31-handheld-via-newer-libmali` naming style.

## 3. Category directory path

`docs/solutions/best-practices/`

Full target path:
`docs/solutions/best-practices/electrobun-aarch64-handheld-via-bwrap-nix-closure-2026-05-27.md`

## 4. YAML frontmatter (ready to paste)

```yaml
---
module: nix/korri-desktop
date: 2026-05-27
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - "Running an Electrobun (Bun + native WebView) desktop app on an aarch64 handheld whose stock OS has no usable /nix and a glibc older than 2.38"
  - "The app needs a WebKitGTK / GTK3 / glib / libsoup stack newer than the device's system libraries"
  - "The runtime is launched under a Wayland compositor (e.g. cage) whose own LD_LIBRARY_PATH would poison child processes"
  - "Upstream Electrobun aarch64 prebuilts (launcher, libNativeWrapper.so, libasar.so) must be reused on an x86-built bundle"
  - "Persistent storage on the device is an ext4 SD card mounted via bwrap as /nix at runtime"
tags:
  - electrobun
  - aarch64
  - nix-closure
  - bwrap
  - webkit2gtk
  - handheld
related_components:
  - development_workflow
---
```

YAML safety notes applied:
- No array item starts with a reserved indicator (`` ` ``, `[`, `*`, `&`, `!`,
  `|`, `>`, `%`, `@`, `?`), but several `applies_when` entries contain `:`
  followed by content or parenthetical clauses, so all of them are
  double-quoted defensively to satisfy strict YAML parsers.
- `tags` and `related_components` are simple lowercase hyphenated tokens and
  are left unquoted.
- `date` is `YYYY-MM-DD`.

## 5. Rationale (one paragraph)

This learning is a concrete, reproducible recipe for making the Electrobun
runtime render on a constrained aarch64 EmuELEC-class handheld (R36T MAX,
Mali-G31, glibc 2.31, ~970 MB RAM, 680×680 DSI, cage compositor) — not an
abstract structural principle, which is why `best_practice` fits better than
`architecture_pattern`. The win compounds: it reuses the same closure-overlay
+ `ld-linux` re-exec technique already documented for the Korri API on the
same device, captures the non-obvious `LD_LIBRARY_PATH` discipline (scope to
the cohesive nixpkgs-24.05 closure only, never the whole `/nix/store`, and
unset it in the cage wrapper before exec so cage's nixpkgs-unstable libgcrypt
does not poison the child), and pins the exact ingredient list (332-path
nixpkgs-24.05 closure, webkit2gtk_4_1 + gtk3 + glib + libsoup_3 + ATK +
libayatana-appindicator + glibc-2.39, official Bun 1.3.14, Electrobun aarch64
prebuilts swapped into an x86-built bundle). `module: nix/korri-desktop`
points at the Electrobun packaging area; `component: tooling` reflects that
this is a build-and-runtime-composition recipe rather than a product feature;
`severity: medium` because the recipe unblocks a real bring-up path but is
not gating production; and `related_components: [development_workflow]`
captures the cross-cutting build/deploy nature. The tag set
(`electrobun`, `aarch64`, `nix-closure`, `bwrap`, `webkit2gtk`, `handheld`)
is chosen to be discoverable from any of the four likely future search
entry points: framework, architecture, runtime mechanism, and target class.
