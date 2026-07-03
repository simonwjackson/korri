---
title: "feat: RPCS3 unified settings surface (all phases)"
type: feat
status: active
date: 2026-07-02
origin: work/items/active/20260702-rpcs3-aka-source-plugin/rpcs3-settings-maximalist-proposal.md
verify_command: "bun test product/plugins/rpcs3/src product/platform/library/config"
---

# feat: RPCS3 unified settings surface (all phases)

## Summary

Replace the RPCS3 plugin's bare-minimum policy with **one unified semantic
settings tree** under `settings.plugin` (`@korri:rpcs3`), where the author
declares *what* they want and the plugin decides *how* to deliver it — CLI
flag, `config.yml` key, or GUI ini entry — via an internal mapping table. Ship
the settled `LaunchOverrides` raw escape hatch (`overrides.args`,
`overrides.config`) so anything unmodeled is reachable, and curate the **full
RPCS3 `config.yml` surface** as typed settings, delivered across four sequenced
phases **within this plan** — from the "everyone has an opinion" set (resolution,
frame limit, audio, fullscreen) through power-user tweaks and per-game accuracy
tuning to the deep defaults nobody touches. The escape hatch remains for
forward-compat with new RPCS3 versions and any deliberately-unmodeled internals.

---

## Problem Frame

The RPCS3 plugin today only understands `command`, `state.root`,
`firmware.sentinel`, `env`, and `extra.args`. Everything that actually shapes a
PS3 boot — resolution, frame limit, audio backend/volume, fullscreen, popup
suppression, language — is hand-edited on the device
(`~/.config/rpcs3/config.yml`, `GuiConfigs/CurrentSettings.ini`) or hard-coded
into `--no-gui`. There is no declarative, cascade-aware, validated way to
configure a launch. This plan gives the plugin a proper settings surface while
keeping the authoring vocabulary free of emulator-delivery details, and
converges the raw-passthrough hatch onto the shape the codebase already settled
(`LaunchOverrides`) rather than inventing a new one. Full rationale and the
plugin/format audit live in the origin proposal.

---

## Requirements

- R1. RPCS3 is configured through a **single unified semantic settings tree**
  under `settings.plugin`; the delivery mechanism (argv / `config.yml` / GUI
  ini) never appears in the authoring schema. *(origin §5)*
- R2. The RPCS3 `config.yml` surface is modeled as curated typed settings —
  Video (incl. nested `Vulkan` / `Performance Overlay`), Audio, Core (CPU/SPU
  accuracy), System, Net, Savestate, Miscellaneous, VFS, and Log — delivered
  across four sequenced phases by user-facing importance, **all within this
  plan** (Phases 3-4 in scope but sequenced last and demand-driven, with the
  escape hatch covering them meanwhile). Phase 1 (everyone-has-an-opinion):
  `video.resolution`,
  `video.aspectRatio`, `video.fullscreen`, `video.frameLimit`,
  `video.vsync`, `audio.volume`, `audio.device`. *(origin §11)*
- R3. Functional headless-boot essentials are declarable/materialized so RPCS3
  runs unattended: no-gui, fullscreen/headless, exit-when-game-closes, popup
  suppression; existing firmware/state gating is retained. *(origin §11 Phase 0)*
- R4. Raw escape hatch via the settled `LaunchOverrides` shape: `overrides.args`
  and `overrides.config` (plain-text). `prepend`/`append` **accumulate across
  layers**; `replace` is most-specific-wins. `overrides.args.replace` replaces
  only the plugin's routed-flags segment, never `--no-gui`/`--config`/game path.
  *(origin §4a-bis, §8; swarm)*
- R5. Settings and overrides deep-merge across cascade layers with documented,
  predictable semantics. *(origin §8)*
- R6. `command` and `env` remain standard (not nested under `settings.plugin`);
  the plugin consumes `context.env`; `state.root` drives the emulator directory
  via `XDG_CONFIG_HOME`/`HOME`. *(origin §4a, §4a-bis)*
- R7. The per-launch config is materialized under the state root and passed via
  `--config`; the operator's canonical `config.yml` is not clobbered. *(origin §3b, §6)*
- R8. `Rpcs3Policy` decodes via Effect Schema with typed errors and strict
  excess-property rejection for curated keys; clean Korri enum names translate
  to RPCS3's config strings via value maps. *(origin §7, §9)*

**Origin acceptance examples:** the origin proposal is a design document, not a
brainstorm requirements doc, so it defines no A/F/AE IDs. Requirements above are
derived during planning and traced to origin sections.

---

## Scope Boundaries

- All four phases (the full curated `config.yml` surface) are **in scope** for
  this plan, but **Phases 3-4 (U9/U10) are explicitly sequenced last and
  demand-driven**: they land only after U8, and the `overrides.config` escape
  hatch fully covers their keys until each is built. Nothing downstream blocks
  on them.
- The one deliberate exclusion: deep debug/telemetry-only toggles with no
  realistic user value (e.g. `PPU Debug`, `SPU Debug`, `MFC Debug`, profilers,
  `GDB Server`, `Assume External Debugger`) stay escape-hatch-only rather than
  being given curated names.
- Not building the normalized cross-emulator policy (origin §10) — RPCS3 stays a
  standalone typed tree this plan.
- Not wiring `overrides` into the **generic** readable composer
  (`compose-launch-spec.ts`). RPCS3 applies overrides inside its own
  materializer; generalizing to all launchers is deferred.
- Not migrating Steam/Ryubing `extra` to `overrides` (fleet normalization).
- No device rollout in this plan; Aka is only the intended validation target once
  operator-supplied firmware exists. No per-game **profile/content** authoring
  (U9 models accuracy knobs at the setting level, not per-title profiles); no
  firmware/asset bundling; no `--input-config` **content** authoring (only pass a
  named input config through if supplied).

### Deferred to Follow-Up Work

- Normalized cross-emulator settings policy (origin §10): fleet-wide, separate
  initiative.
- Generic-composer `overrides` consumption + Steam/Ryubing `extra` → `overrides`
  convergence: platform normalization follow-up.
- Input/Output device-handler **content** (pad/keyboard mapping bodies): only a
  named `--input-config` is passed through here; authoring its content is separate.

---

## Context & Research

### Relevant Code and Patterns

- `product/plugins/rpcs3/src/policy.ts` — current hand-rolled `Rpcs3Policy`
  decoder to replace with an Effect Schema.
- `product/plugins/rpcs3/src/materializer.ts` — `rpcs3ReadableLaunchIntegration`
  and `materializeReadableRpcs3Resources`; already validates command / game
  folder / state root / firmware sentinel and resolves `{storage:…}` tokens.
- `product/plugins/rpcs3/src/launch-spec.ts` — `composeRpcs3LaunchSpec`, the
  single argv authority.
- `product/plugins/ryubing/src/policy.ts` + `materializer.ts` — reference for a
  rich typed policy (`Schema.Struct` groups) and for writing a config file
  **atomically into the state root** (`writeAtomic`, `join(stateRoot, …)`), the
  pattern RPCS3's `config.yml` write should mirror.
- `product/plugins/retroarch/src/launch-spec.ts:121` — `extraSettings` "permanent
  break-glass layer rendered last", the precedent for append-last override text.
- `product/platform/library/config/inheritable-fields.ts` — `MoonlightPolicy` is
  the model for a curated typed policy with enum literals + value maps.
- `product/platform/library/config/records/library-item.ts:118` — the **settled**
  `LaunchOverrides` schema (`args:{prepend,append,replace}`,
  `config:{prepend,append,replace}` string-valued), attached as
  `ReleaseLaunch.overrides` (line 145) but **not consumed** by the resolver.
- `product/platform/library/config/cascade-resolver.ts` — `resolveReadableLaunchContext`
  builds `ReadableResolvedLaunchContext`; readable-layer folding lives here.
- `product/platform/library/config/resolved-launch-context.ts` — the context
  shape a plugin materializer reads.
- `product/platform/library/proseql/library-repository.ts:170` — `ReadableLaunchIntegration`
  interface; `materialize(context, options?)` where `options` carries only `env`
  (no artifact root → plugins write into the state root).

### Institutional Learnings

- `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`
  and `retroarch-png-extension-routes-to-image-display-core-2026-05-27.md` —
  keep CLI unambiguous; hidden flag precedence bites. Relevant to argv assembly
  order in U5 (`--config` + flags + game path).

### External References

- RPCS3 config surface + CLI captured live from the Aka build (RPCS3
  0.0.41-nixpkgs-40e9ee5): `config.yml` is **YAML** (yaml-cpp), and the CLI
  exposes `--config <path>`, `--no-gui`, `--headless`, `--fullscreen`,
  `--game-screen`, `--user-id`, `--input-config`. See origin §3.

---

## Key Technical Decisions

- **Unified semantic tree; delivery is an implementation detail.** `settings.plugin`
  groups by domain (`video`/`audio`/`core`/`system`/`net`/`savestate`/`vfs`/`boot`/`log`
  + `state`/`firmware`), never by mechanism; a mapping table routes each leaf to
  argv/config/ini. **Authoritative taxonomy:** every group name mirrors a
  `config.yml` section — all Video-backed settings live under `video.*` (incl.
  nested `video.vulkan.*`, `video.performanceOverlay.*`); there is no separate
  `display`/`performance`/`graphics` group. *(origin §5, §9)*
- **A semantic setting may materialize to MORE THAN ONE mechanism, and false
  values are materialized when absence is not itself an override.** e.g.
  `video.fullscreen` sets both `--fullscreen` (flag) *and*
  `Miscellaneous.Start games in fullscreen mode` (config), because a flag can
  only express "on" — `false` must be written to config to actually disable it
  against a canonical config that may already say `true`. Mapping rows therefore
  carry one-or-more outputs; the router does not assume a single bucket per leaf.
  *(swarm: adversarial P1)*
- **Raw passthrough uses the settled `LaunchOverrides`,** not a new `settings.extra`
  or a plugin-buried `extra`. `overrides.config` is plain text in the emulator's
  native format (YAML for RPCS3); `overrides.args` is argv. *(origin §4a-bis)*
- **Per-launch config write location:** materialize to `<stateRoot>/korri/config.yml`
  (atomic write mirroring ryubing's `writeAtomic`) and pass `--config <path>`.
  Provider integrations receive no artifact root, so the writable state root is
  the idiomatic sink; using a dedicated `korri/` subdir keeps the operator's
  canonical `config.yml` untouched (R7).
- **Config materialization model is gated on a spike (U0).** The plan's default
  is a partial `--config` file relying on RPCS3 to fill unspecified keys, but
  this is an **unverified emulator contract**: if `--config <path>` is treated as
  the *complete* active config, a Phase-1 file would silently discard operator
  renderer/audio/locale/accuracy settings. U0 proves (a) partial-vs-complete
  semantics, (b) whether RPCS3 writes the file back on exit, (c) yaml-cpp
  duplicate-key behavior for `overrides.config` append. The chosen model
  (partial, read-merge-canonical, or version-pinned baseline) follows from U0 and
  is a prerequisite for U2/U3/U4. *(swarm: adversarial P1, feasibility)*
- **`env` is standard.** Drop the plugin-level `env`; consume `context.env` and
  add plugin-produced `XDG_CONFIG_HOME`/`HOME` derived from `state.root`. *(origin §4a-bis)*
- **`command` stays an app-record field;** `state`/`firmware` stay under
  `settings.plugin` (genuinely plugin-specific). *(origin §4a)*
- **`LaunchOverrides` wiring is RELEASE-SCOPED only.** Surface a resolved
  `overrides` object on `ReadableResolvedLaunchContext`, folded from the
  **persisted `release.launch.overrides`** layer only. Do **not** fold it from
  the ephemeral/runtime override layer: `EphemeralOverride` deliberately excludes
  raw argv/config/command surfaces because `app.library.launch` is
  unauthenticated on trusted-LAN deployments
  (`ephemeral-override.ts:161-165`), and `overrides` is exactly raw argv/config.
  The RPCS3 materializer consumes it; generic-composer application deferred.
  *(swarm: feasibility P1; origin §4a-bis, §12 Q6)*
- **Override merge = concatenate, not last-write-wins.** `args.prepend`/`append`
  and `config.prepend`/`append` **accumulate across layers in inheritance order**
  (matching the field names and the existing `argsAppend` concat semantics);
  `replace` is most-specific-wins and suppresses generated/base fragments.
  `overrides.args.replace` replaces only the plugin's **routed-flags segment** —
  never `--no-gui`, `--config`, or the game path. *(swarm: adversarial P1, coherence)*
- **Release-layer allowlist (security).** Release-scoped `@korri:rpcs3` settings
  are filtered to user-tuning keys; `state.root`, `firmware`, `command`, and
  `env` are sourced from app/runtime/operator layers only, so a release payload
  cannot redirect the operator-owned RPCS3 state root. *(swarm: feasibility P2; origin §8)*
- **Effect Schema policy** like `MoonlightPolicy`: enum literals with value maps,
  strict excess-property rejection. *(origin §7)*
- **Versioning & drift policy (guardrail for the large curated surface).** The
  schema/value-maps target a pinned RPCS3 version (the Aka build,
  `0.0.41-nixpkgs-40e9ee5`), recorded in the plugin README. When a newer RPCS3
  renames/removes a value, the stale enum must **not** hard-block a launch:
  authors always have `overrides.config` to set the raw key, and value-map
  changes are a README-documented, test-guarded edit. Phases 3-4 are
  demand-driven precisely to limit this drift surface. *(swarm: adversarial P2)*

---

## Open Questions

### Resolved During Planning

- Schema shape: unified semantic tree (not cli/config/gui split, not pure
  passthrough). *(origin §4, user-confirmed)*
- Raw passthrough home: settled `overrides.args`/`overrides.config`. *(origin §4a-bis, user-confirmed)*
- Config strategy: partial `--config` file first. *(origin §12 Q2)*
- `command`: keep as app-record field. `env`: standard, consume `context.env`.

### Deferred to Implementation

- The RPCS3 `--config` materialization model (partial / read-merge / baseline) is
  owned by **U0** and settled there before U2/U3/U4 fan out.
- Exact enum value maps for each setting — verify every mapped string against the
  captured `config.yml` (e.g., `VSync Mode` literal spelling) as each group lands
  (U3/U8/U9/U10).

---

## Output Structure

*(Non-exhaustive shape; per-unit **Files** sections are authoritative. Also
touched: `product/plugins/rpcs3/README.md`,
`product/platform/library/config/readable-cascade-resolver.test.ts`.)*

    product/plugins/rpcs3/src/
      policy.ts            # rewritten: unified Effect Schema tree
      mapping.ts           # new: unified setting -> delivery + target + value map
      config-render.ts     # new: config entries -> YAML text + overrides.config apply
      gui-preseed.ts       # new: CurrentSettings.ini popup-suppression preseed
      materializer.ts      # modified: route settings, write config, assemble spec
      launch-spec.ts       # modified: argv assembly (flags + --config + overrides.args)
      plugin.ts            # modified: unified default settings, drop plugin env
      policy.test.ts       # rewritten
      mapping.test.ts      # new
      config-render.test.ts# new
      gui-preseed.test.ts  # new
      materializer.test.ts # updated
      launch-spec.test.ts  # updated
      plugin.test.ts       # updated
    product/platform/library/config/
      resolved-launch-context.ts   # modified: add `overrides` field
      cascade-resolver.ts          # modified: fold overrides into readable context

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should treat
> it as context, not code to reproduce.*

Delivery pipeline — one unified policy fans out into three delivery buckets plus
the raw escape hatch:

```text
settings.plugin (unified semantic tree)          overrides (LaunchOverrides)
        │                                                │
   decodeRpcs3Policy (Effect Schema)              resolved on context
        │                                          ┌─────┴─────┐
   routeSettings (mapping.ts)                   args         config (string)
        ├── flags[]   ──────────────┐              │              │
        ├── configEntries[] ──┐     │              │              │
        └── iniEntries[] ─┐   │     │              │              │
                          ▼   ▼     ▼              ▼              ▼
              CurrentSettings.ini  config.yml YAML text   argv    append/prepend/replace
              (state root)         + overrides.config →   flags   into config text / argv
                                   <stateRoot>/korri/config.yml
                                          │
                                   --config <path>  ──►  composeRpcs3LaunchSpec argv
```

Delivery decision matrix (internal to the plugin; **not** author-facing) — a
representative slice; the mapping table is seeded in U3 and extended by U8-U10:

| Unified setting | Delivery | Target |
|---|---|---|
| `video.resolution` | config | `Video.Resolution` |
| `video.aspectRatio` | config | `Video.Aspect ratio` |
| `video.fullscreen` | flag | `--fullscreen` |
| `video.frameLimit` | config | `Video.Frame limit` |
| `video.vsync` | config | `Video.VSync Mode` |
| `audio.volume` | config | `Audio.Master Volume` |
| `audio.device` | config | `Audio.Audio Device` |
| `boot.headless` | flag | `--headless` |
| `boot.exitOnFinish` | config | `Miscellaneous.Exit RPCS3 when process finishes` |
| `boot.suppressPopups` | ini | `CurrentSettings.ini` infoBox*/confirmationBox* |
| `state.root` | env | `XDG_CONFIG_HOME`/`HOME` |
| `firmware.sentinel` | assert | preflight path check |

---

## Implementation Units

### U0. Spike: verify RPCS3 `--config` semantics (pre-implementation)

**Goal:** De-risk the whole materialization model by proving how RPCS3 v0.0.41
treats a `--config` file *before* any schema/mapping fan-out.

**Requirements:** R7

**Dependencies:** None (must precede U2, U3, U4)

**Files:**
- Investigation only; record the contract in this work item's `work.md` and, if
  useful, a captured config fixture under `product/plugins/rpcs3/src/__fixtures__/`.

**Approach:**
- On the Aka build, boot with a minimal `--config` file whose single key is the
  opposite of the canonical `<stateRoot>/config.yml`; observe whether
  unspecified keys fall back to built-in defaults, to the canonical config, or
  are wiped.
- Check whether RPCS3 rewrites the `--config` file on exit (write-back).
- Check yaml-cpp duplicate-key behavior when a second top-level section is
  appended (governs whether `overrides.config` can safely append raw YAML or
  must deep-merge).
- Decide the materialization model: partial file, read-merge-canonical, or
  version-pinned baseline. This choice is a prerequisite for U2/U3/U4.

**Execution note:** Investigation spike — no production code; capture a
testable contract, not a behavior change.

**Test scenarios:**
- Test expectation: none — investigation spike; the recorded contract becomes the
  expectations U4's tests encode.

**Verification:**
- The materialization model and the `overrides.config` apply strategy are chosen
  and documented with evidence before U2/U3/U4 begin.

---

### U1. Surface resolved `overrides` (LaunchOverrides) on the readable launch context

**Goal:** Make the schema-settled but unconsumed `LaunchOverrides` reachable at
launch by folding a resolved `overrides` object onto `ReadableResolvedLaunchContext`.

**Requirements:** R4, R5

**Dependencies:** None

**Files:**
- Modify: `product/platform/library/config/resolved-launch-context.ts`
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Test: `product/platform/library/config/readable-cascade-resolver.test.ts`

**Approach:**
- Add an optional `overrides` field (the existing `LaunchOverrides` shape) to
  `ReadableResolvedLaunchContext`.
- Fold it through `mergeReadableLayers` / `resolveReadableLaunchContext` with
  **concatenate** semantics: `args.prepend`/`args.append` and
  `config.prepend`/`config.append` **accumulate across layers in inheritance
  order** (matching the field names and existing `argsAppend` concat); `replace`
  is most-specific-wins and suppresses base/generated fragments (R5).
- **Release-scoped only:** fold from the persisted `release.launch.overrides`
  layer. Do **not** fold from the ephemeral/runtime override layer
  (`EphemeralOverride` intentionally withholds raw argv/config surfaces because
  `app.library.launch` is unauthenticated on trusted-LAN; `ephemeral-override.ts:161-165`).
- **Release-layer allowlist:** filter release-scoped `@korri:rpcs3` settings to
  user-tuning keys so a release cannot set `state.root`/`firmware`/`command`/`env`
  (extend the `stripContentPathOverride` guard in `readableViewOfRelease`).
- Do not touch the generic composer.

**Patterns to follow:**
- `mergeReadableLayers` / `readableViewOf*` in `cascade-resolver.ts`.
- `LaunchOverrides` schema in `records/library-item.ts:118`.

**Test scenarios:**
- Happy path: `overrides` set on a release reaches `context.overrides` intact.
- Edge case: no overrides anywhere → `context.overrides` is `undefined`.
- Merge (concat): a less-specific and a more-specific layer both set
  `config.append` → both fragments survive in inheritance order; same for
  `args.append`.
- Edge case: `overrides.replace` at the more-specific layer suppresses the
  accumulated fragments from less-specific layers.
- Security: a release payload setting `@korri:rpcs3` `state.root` is filtered out
  and does not reach `context` (allowlist).

**Verification:**
- Resolving a release that carries `overrides` yields a context whose
  `overrides` matches the authored values under the documented merge rule.

---

### U2. Rewrite `Rpcs3Policy` as a unified semantic Effect Schema

**Goal:** Replace the hand-rolled decoder with a strict Effect Schema grouped by
semantic domain, covering Phase 0 boot essentials + Phase 1 opinion settings +
`state`/`firmware`.

**Requirements:** R1, R2, R3, R8

**Dependencies:** U0 (materialization model)

**Files:**
- Modify: `product/plugins/rpcs3/src/policy.ts`
- Test: `product/plugins/rpcs3/src/policy.test.ts`

**Approach:**
- `Rpcs3Policy = Schema.Struct({ display?, performance?, audio?, boot?, state?, firmware? })`,
  strict (`onExcessProperty: "error"`) for curated keys, mirroring `MoonlightPolicy`.
- Phase 1 groups: `display { resolution, aspectRatio, fullscreen }`,
  `performance { frameLimit, vsync }`, `audio { volume, device }`.
- Phase 0 boot group: `boot { headless, exitOnFinish, suppressPopups, autoStart }`
  (no-gui is an always-on default of the headless launch, not authored here).
- Retain `state { root }` and `firmware { sentinel }`.
- Enum-ish fields use `Schema.Literals` with clean Korri names (value→RPCS3
  string mapping lives in U3, not the schema). No `env`/`command`/`cli`/`config`/
  `gui` nodes.

**Patterns to follow:**
- `MoonlightPolicy` struct + literal enums in `inheritable-fields.ts`.
- `RyubingPolicy` grouping in `ryubing/src/policy.ts`.

**Test scenarios:**
- Happy path: a full Phase 0+1 tree decodes to the typed policy.
- Edge case: partial trees (only `display`, only `boot`) decode; empty policy → `{}`.
- Error path: unknown key (e.g. `video.reslution` typo) fails decode with the
  offending key path.
- Error path: invalid enum literal (`video.aspectRatio: "17:9"`) fails.
- Edge case: `state.root` empty string rejected; `firmware.sentinel` optional.

**Verification:**
- Decoding valid Phase 0+1 policies succeeds; malformed keys/enums fail with
  clear errors.

---

### U3. Delivery mapping table + router

**Goal:** Translate a decoded unified policy into three delivery buckets
(argv flags, config entries, GUI ini entries), applying value maps.

**Requirements:** R1, R2, R3, R8

**Dependencies:** U0, U2

**Files:**
- Create: `product/plugins/rpcs3/src/mapping.ts`
- Test: `product/plugins/rpcs3/src/mapping.test.ts`

**Approach:**
- Declare a table mapping each unified leaf to `{ delivery, target, valueMap }`.
- `routeSettings(policy) -> { flags: string[], configEntries: [sectionPath, value][], iniEntries: [key, value][] }`.
- Value maps for Phase 1/0: `vsync true→"Vertical Sync" / false→"Disabled"`;
  `resolution`/`aspectRatio`/`audio.device` verbatim; `audio.volume`/`frameLimit`
  numeric/verbatim; `video.fullscreen`/`boot.headless` present-when-true flags;
  `boot.exitOnFinish`/`autoStart` bool config; `boot.suppressPopups` expands to
  the infoBox*/confirmationBox* ini key group.
- Verify each mapped RPCS3 target string against the captured `config.yml`.
- **Multi-output + false materialization:** a mapping row may emit to more than
  one bucket (e.g. `video.fullscreen` → `--fullscreen` flag **and**
  `Miscellaneous.Start games in fullscreen mode` config), and boolean `false` is
  written to config when omission would not disable it against a canonical config
  that may already say `true`. Tests start from a canonical config with the
  opposite value, not an empty world.

**Patterns to follow:**
- RetroArch's `appendOptionalSettings` value-map style (`retroarch/src/launch-spec.ts`).
- Origin §9 mapping table.

**Test scenarios:**
- Happy path: each Phase 1 setting routes to the correct bucket with the
  translated value (`vsync:false → configEntries has ["Video.VSync Mode","Disabled"]`).
- Edge case: `video.fullscreen:true → --fullscreen flag AND config
  "Start games in fullscreen mode: true"`; `false → no flag AND config
  "...: false"` (disables against a canonical `true`).
- Edge case: `boot.suppressPopups:true → iniEntries include the full
  infoBox*/confirmationBox* set = false`.
- Edge case: unset groups contribute nothing to any bucket.

**Verification:**
- A representative policy fans out to the exact expected flags/config/ini entries.

---

### U4. Materialize `config.yml` + apply `overrides.config` + emit `--config`

**Goal:** Render config entries to YAML text, apply the raw `overrides.config`
text, write atomically under the state root, and expose the path for `--config`.

**Requirements:** R4, R7

**Dependencies:** U0, U1, U2, U3

**Files:**
- Create: `product/plugins/rpcs3/src/config-render.ts`
- Modify: `product/plugins/rpcs3/src/materializer.ts`
- Test: `product/plugins/rpcs3/src/config-render.test.ts`
- Test: `product/plugins/rpcs3/src/materializer.test.ts`

**Approach:**
- Materialization model follows U0's finding (partial / read-merge-canonical /
  version-pinned baseline). Render routed `[sectionPath, value]` entries to
  RPCS3's nested YAML.
- Apply `context.overrides?.config`: `replace` wins whole-file; otherwise the
  accumulated `prepend` fragments go before and `append` fragments after. If
  U0 shows raw YAML append is unsafe (yaml-cpp duplicate-key drops siblings),
  deep-merge the fragment into the rendered object instead of string concat.
- **Per-launch isolation:** write to a per-release deterministic path,
  `<stateRoot>/korri/config-<releaseId>.yml` (atomic temp+rename, `mode 0o640`,
  `mkdir -p korri/`), so concurrent/again launches don't share one mutable file;
  never touch the operator's `<stateRoot>/config.yml`.
- Return the path so U5 can add `--config <path>`.
- **`--config` emission contract:** emit `--config <path>` whenever there are
  routed config entries OR `overrides.config`; otherwise omit it and let RPCS3
  use the canonical state config (assert this contract in tests — resolves the
  R7/U5 vs U4 ambiguity).

**Patterns to follow:**
- Ryubing `writeAtomic` + `join(stateRoot, …)` in `ryubing/src/materializer.ts`.

**Test scenarios:**
- Happy path: config entries render to valid nested YAML sections.
- Happy path: `overrides.config.append` text appears verbatim after generated
  text; `prepend` before; `replace` yields exactly the override text.
- Edge case: no config entries and no overrides → no file written and no
  `--config` in argv (canonical state config used).
- Integration: two releases materialize to distinct `config-<releaseId>.yml`
  files (no shared mutable file).
- Integration: file is written under `<stateRoot>/korri/config.yml` and the
  operator's `<stateRoot>/config.yml` is untouched.

**Verification:**
- Materializing a policy produces a readable `korri/config.yml` under the state
  root containing the routed keys plus any override text.

---

### U5. Argv assembly in `composeRpcs3LaunchSpec`

**Goal:** Assemble argv from the flag bucket, `--config`/optional `--input-config`,
`overrides.args`, and the game folder path, in an unambiguous order.

**Requirements:** R2, R3, R4

**Dependencies:** U2, U3, U4

**Files:**
- Modify: `product/plugins/rpcs3/src/launch-spec.ts`
- Test: `product/plugins/rpcs3/src/launch-spec.test.ts`

**Approach:**
- Order: `[command, --no-gui, ...overrides.args.prepend, ...routedFlags,
  --config <path>, (--input-config <name>?), ...overrides.args.append, gameFolder]`.
  `overrides.args.replace`, when present, replaces the routed-flags segment only
  (documented), keeping `--no-gui`/`--config`/game path intact.
- `--fullscreen` only emitted alongside `--no-gui` (RPCS3 honors it only then).
- Keep `composeRpcs3LaunchSpec` the single argv authority; env merge stays in the
  materializer (U7).

**Patterns to follow:**
- Existing `composeRpcs3LaunchSpec` signature; RetroArch argv ordering discipline
  (institutional learnings).

**Test scenarios:**
- Happy path: flags precede the game folder path; `--config <path>` present.
- Edge case: `video.fullscreen:true` → `--fullscreen` present and only with
  `--no-gui`.
- Edge case: `overrides.args.prepend`/`append` land in the documented positions.
- Error path: non-absolute command still rejected (existing invariant preserved).

**Verification:**
- Composed argv matches the documented order for representative policies.

---

### U6. GUI popup-suppression preseed (`CurrentSettings.ini`)

**Goal:** Route ini-delivered settings (popup suppression) into
`GuiConfigs/CurrentSettings.ini` under the state root, idempotently.

**Requirements:** R3

**Dependencies:** U2, U3

**Files:**
- Create: `product/plugins/rpcs3/src/gui-preseed.ts`
- Modify: `product/plugins/rpcs3/src/materializer.ts`
- Test: `product/plugins/rpcs3/src/gui-preseed.test.ts`

**Approach:**
- When `iniEntries` are present, write/patch
  `<stateRoot>/GuiConfigs/CurrentSettings.ini`, setting the
  infoBox*/confirmationBox* keys (welcome, boot-game, exit-game, install-pup,
  obsolete-cfg, restart). Merge into an existing file rather than clobbering it;
  `mkdir -p GuiConfigs`.
- Only runs when suppression settings are present; otherwise no-op.

**Patterns to follow:**
- Ryubing state-root writes; the ini keys captured on Aka in the origin session.

**Test scenarios:**
- Happy path: `boot.suppressPopups:true` writes the suppression keys `= false`.
- Edge case: absent suppression settings → file not created/modified.
- Integration: an existing `CurrentSettings.ini` keeps unrelated keys; only the
  targeted keys are updated.

**Verification:**
- After materialization with suppression on, `CurrentSettings.ini` under the
  state root carries the expected keys and preserves others.

---

### U7. Plugin record, env derivation, and README

**Goal:** Update the plugin's default launcher record to the unified shape, drop
the plugin-level `env`, derive `XDG_CONFIG_HOME`/`HOME` from `state.root`, and
document the surface.

**Requirements:** R1, R6

**Dependencies:** U2, U4, U5

**Files:**
- Modify: `product/plugins/rpcs3/src/plugin.ts`
- Modify: `product/plugins/rpcs3/src/materializer.ts`
- Modify: `product/plugins/rpcs3/README.md`
- Test: `product/plugins/rpcs3/src/plugin.test.ts`

**Approach:**
- Update the default `settings.plugin` to the unified tree (keep `state`/`firmware`
  under `.plugin`); ensure `command` stays the app-record field and is not
  duplicated under `settings.plugin`.
- In the materializer, build launch env from `context.env` (drop any plugin-level
  `env` field). **Explicit state-dir contract:** `state.root` **is** the RPCS3
  emulator config dir (where `dev_flash`/firmware/`config.yml` live, matching the
  existing firmware-sentinel join). RPCS3 resolves that dir as
  `$XDG_CONFIG_HOME/rpcs3`, so set `XDG_CONFIG_HOME = dirname(state.root)` and
  `HOME = dirname(state.root)`, and assert `basename(state.root) == "rpcs3"` (the
  defaults `/var/lib/korri/rpcs3` and `~/.config/rpcs3` both satisfy this).
- README: document the unified settings tree, the delivery-is-internal principle,
  Phase 1 settings, and the `overrides.args`/`overrides.config` escape hatch.

**Patterns to follow:**
- Current `plugin.ts` contributes/config block; origin §5 authoring example.

**Test scenarios:**
- Happy path: default plugin record exposes the unified `settings.plugin` shape;
  `command` present at record level, absent under `settings.plugin`.
- Integration: materialized env includes `XDG_CONFIG_HOME`/`HOME` from
  `state.root` and carries `context.env` entries.
- Edge case: no `context.env` → env still contains the derived XDG vars.

**Verification:**
- Plugin discovery/config tests pass; a launch materialization sets the emulator
  dir via env and the argv/config reflect the unified settings.

---

### U8. Phase 2 — power-user settings (schema + mapping extension)

**Goal:** Add the power-user tranche to the unified tree and mapping table.

**Requirements:** R2, R8

**Dependencies:** U2, U3 (delivery via U4/U5 already built)

**Files:**
- Modify: `product/plugins/rpcs3/src/policy.ts`
- Modify: `product/plugins/rpcs3/src/mapping.ts`
- Test: `product/plugins/rpcs3/src/policy.test.ts`
- Test: `product/plugins/rpcs3/src/mapping.test.ts`

**Approach:**
- Add settings + value maps: `video.renderer` (`Video.Renderer`;
  `vulkan/opengl/null`), `video.resolutionScale` (`Video.Resolution Scale`),
  `video.anisotropicFilter` (`Video.Anisotropic Filter Override`),
  `video.shaderMode` (`Video.Shader Mode`), `audio.backend` (`Audio.Renderer`;
  `cubeb/faudio/null`), `audio.format` (`Audio.Audio Format`),
  `system.language` (`System.Language`; enum map), `system.licenseArea`
  (`System.License Area`).
- All config-delivered; extend the same mapping table (no new delivery buckets).

**Patterns to follow:**
- U2/U3 shape; origin §9 value maps.

**Test scenarios:**
- Happy path: `video.renderer:vulkan → ["Video.Renderer","Vulkan"]`;
  `audio.backend:faudio → ["Audio.Renderer","FAudio"]`.
- Happy path: `system.language:en-US → ["System.Language","English (US)"]`.
- Edge case: `video.resolutionScale` int passthrough.
- Error path: invalid enum (`video.renderer:metal`) rejected at decode.

**Verification:**
- Power-user settings decode and route to the correct `config.yml` keys.

---

### U9. Phase 3 — per-game tuning (CPU/GPU accuracy)

**Sequencing:** **Later phase** — build after U8, and only on demand. Not on the
critical path; `overrides.config` covers these knobs until this lands. Splitting
to a separate per-game-tuning work item is acceptable if a concrete game need
appears first.

**Goal:** Model the accuracy/tuning knobs people flip for specific games.

**Requirements:** R2, R8

**Dependencies:** U2, U3, U4 (introduces the first list-valued config entry, so needs the renderer)

**Files:**
- Modify: `product/plugins/rpcs3/src/policy.ts`
- Modify: `product/plugins/rpcs3/src/mapping.ts`
- Test: `product/plugins/rpcs3/src/policy.test.ts`
- Test: `product/plugins/rpcs3/src/mapping.test.ts`

**Approach:**
- CPU: `core.ppuDecoder`/`core.spuDecoder` (enum maps to `Recompiler (LLVM)`
  etc.), `core.spuBlockSize` (`safe/mega/giga`), `core.spuXFloatAccuracy`
  (`approximate/accurate/relaxed`), `core.preferredSpuThreads` (int),
  `core.clocksScale` (`Clocks scale`, int), `core.librariesControl`
  (LLE **list** → `Libraries Control`).
- GPU accuracy: `video.writeColorBuffers`, `video.writeDepthBuffer`,
  `video.readColorBuffers`, `video.strictRendering`
  (`Strict Rendering Mode`), `video.msaa` (`MSAA`), `video.disableZcull`
  (`Disable ZCull Occlusion Queries`).
- Introduces the first **list-valued** config entry (`librariesControl`);
  `config-render.ts` (U4) must render a YAML sequence for it — confirm/extend.

**Patterns to follow:**
- Origin §9 mapping rows; captured `config.yml` `Core`/`Video` sections.

**Test scenarios:**
- Happy path: `core.spuBlockSize:mega → ["Core.SPU Block Size","Mega"]`.
- Happy path: `core.librariesControl:["libfoo.sprx:lle"]` renders as a YAML list
  under `Core.Libraries Control`.
- Edge case: boolean GPU toggles render as `true/false`.
- Error path: invalid decoder enum rejected.

**Verification:**
- Accuracy settings (incl. the LLE list) decode and render correctly.

---

### U10. Phase 4 — deep defaults, nested subtrees, and the long tail

**Sequencing:** **Later phase** — build last, and only on demand. Not on the
critical path; `overrides.config` covers the entire long tail until (and unless)
this lands. Curate individual deep keys as concrete needs appear rather than
boiling the ocean up front.

**Goal:** Model the remaining surface — nested Video subtrees, Net, Savestate,
VFS, extended Miscellaneous, and Log — leaving only value-free debug toggles to
the escape hatch.

**Requirements:** R2, R8

**Dependencies:** U2, U3, U4 (nested rendering)

**Files:**
- Modify: `product/plugins/rpcs3/src/policy.ts`
- Modify: `product/plugins/rpcs3/src/mapping.ts`
- Modify: `product/plugins/rpcs3/src/config-render.ts`
- Test: `product/plugins/rpcs3/src/policy.test.ts`
- Test: `product/plugins/rpcs3/src/mapping.test.ts`
- Test: `product/plugins/rpcs3/src/config-render.test.ts`

**Approach:**
- Nested subtrees: `video.vulkan { adapter, exclusiveFullscreen,
  asyncTextureStreaming, ... }` → `Video.Vulkan.*`; `video.performanceOverlay
  { enabled, position, detailLevel, ... }` → `Video.Performance Overlay.*`.
- `net { internet, dns, ipAddress, upnp, psn }` → `Net.*`; `savestate {
  startPaused, saveDiscGameData, maxFiles, ... }` → `Savestate.*`;
  `vfs { enableHostRoot, initializeDirectories, diskCacheSizeMb, ... }` → `VFS.*`;
  extended `boot`/`misc` hints (`showTrophyPopups`, `windowTitleFormat`, ...) →
  `Miscellaneous.*`; `log { <channel>: level }` → `Log.*` (map).
- `config-render.ts` gains two-level nesting support (`Section.Sub.Key`).
- Explicitly **omit** value-free debug toggles (see Scope Boundaries); they stay
  reachable via `overrides.config`.

**Patterns to follow:**
- Captured `config.yml` nested `Video.Vulkan` / `Performance Overlay` shapes.

**Test scenarios:**
- Happy path: `video.vulkan.exclusiveFullscreen:automatic →
  Video.Vulkan.Exclusive Fullscreen Mode: Automatic` (renders under nested map).
- Happy path: `log.RSX:fatal → Log: { RSX: Fatal }`.
- Edge case: `net.dns` verbatim; `savestate.startPaused` bool.
- Integration: a policy spanning top-level + nested subtrees renders to valid
  multi-level YAML that round-trips through a YAML parser in the test.
- Edge case: an omitted debug key (e.g. `core.ppuDebug`) is rejected by the
  schema, steering the author to `overrides.config`.

**Verification:**
- The full curated surface (minus intentional debug omissions) decodes and
  renders to valid nested `config.yml` YAML.

---

## System-Wide Impact

- **Interaction graph:** U1 modifies shared cascade resolution
  (`resolveReadableLaunchContext`) consumed by every readable launch. The
  `overrides` addition is additive/optional; existing launches with no overrides
  must be unaffected.
- **Error propagation:** Policy decode failures surface as
  `AppMaterializationFailed` with the offending key path (U2); config/ini write
  failures surface as materialization errors, not silent partial writes.
- **State lifecycle risks:** Config and ini writes target the state root. Use
  atomic temp+rename; write launch config to `korri/config.yml` to avoid
  clobbering the operator's canonical `config.yml`; merge (don't overwrite) the
  GUI ini.
- **API surface parity:** `ReadableResolvedLaunchContext.overrides` becomes part
  of the context contract other plugins may later read — kept optional so no
  other integration is forced to change.
- **Integration coverage:** Cross-layer proof that authoring `overrides` on a
  release actually reaches the RPCS3 materializer and changes the emitted argv /
  config file (unit mocks alone won't prove the resolver→materializer path).
- **Unchanged invariants:** Discovery, firmware/state gating, and the absolute-
  command requirement remain as-is; the generic composer and other plugins are
  untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Partial `--config` file causes RPCS3 to drop unspecified keys (blank config) | Verify against v0.0.41 in U4; fall back to a committed baseline overlay if needed (decision + deferred check already recorded) |
| `LaunchOverrides` wiring (U1) touches shared cascade resolution and could regress other launches | Keep `overrides` optional/additive; add regression test that no-override launches are unchanged |
| RPCS3 config target strings mismatch (e.g., exact `VSync Mode` spelling) | U3 verifies each mapped string against the captured `config.yml`; enum value maps centralize the strings |
| Writing under the state root races/corrupts config | Atomic temp+rename with restrictive mode, mirroring ryubing's `writeAtomic` |
| Clobbering the operator's `config.yml` | Write launch config to a dedicated `korri/` subdir and point `--config` there |
| Large curated surface (full `config.yml`) becomes a maintenance burden / drifts across RPCS3 versions | Centralize every RPCS3 string in the `mapping.ts` value maps (single source of truth); phase-sequence the work so value is delivered before the long tail; keep the escape hatch so version drift never blocks a launch |
| Nested subtrees (Vulkan / Performance Overlay) render as malformed YAML | U4/U10 render is proven by a round-trip test that parses the emitted YAML; two-level nesting added deliberately in U10 |
| RPCS3 treats `--config` as the COMPLETE active config, silently discarding operator settings | U0 spike verifies partial-vs-complete before any fan-out; fall back to read-merge-canonical or version-pinned baseline |
| Release payload redirects the operator-owned RPCS3 state root or injects raw argv/config | Release-layer allowlist (U1); `overrides` folded from persisted release layer only, never the unauthenticated ephemeral layer |
| Shared `korri/config.yml` corrupted by concurrent launches / RPCS3 write-back | Per-release `config-<releaseId>.yml` + atomic write; U0 checks write-back |

---

## Phased Delivery

All phases ship **within this plan**, sequenced by user-facing importance. Each
later phase is additive to the same `policy.ts` / `mapping.ts` modules, so the
plugin is releasable after any phase and the escape hatch backstops whatever a
phase hasn't reached yet.

### Phase 0 (foundation & boot essentials) — U0 (spike), U1, U4, U5, U6, U7 + `boot`/`state`/`firmware` in U2/U3
- Plumbing, delivery routing, config write + `--config`, argv assembly, popup
  preseed, record/env, and the `overrides` escape hatch. Makes RPCS3 run
  unattended and makes anything unmodeled reachable immediately.

### Phase 1 ("everyone has an opinion", cross-launcher) — `video`/`audio` groups in U2/U3
- resolution, aspect ratio, fullscreen, frame limit, vsync, audio volume/device.

### Phase 2 (power-user common) — U8
- renderer/backend, resolution scale, anisotropic filter, shader mode, audio
  format, language/region.

### Phase 3 (per-game tuning) — U9 — *later, demand-driven*
- CPU decoders, SPU block size / XFloat, clock scale, LLE libraries control,
  GPU accuracy toggles. Sequenced after Phase 2; escape-hatch backstopped; may
  spin out to its own per-game-tuning work item.

### Phase 4 (deep defaults + nested subtrees) — U10 — *later, demand-driven*
- nested Vulkan / performance overlay, Net, Savestate, VFS, extended
  Miscellaneous, Log; value-free debug toggles intentionally left to the hatch.
  Built last and only as concrete needs surface.

---

## Documentation / Operational Notes

- Update `product/plugins/rpcs3/README.md` (U7) with the unified settings tree,
  the delivery-is-internal principle, the Phase 1 settings, and the escape hatch.
- No device rollout in this plan; live validation on Aka remains gated on
  operator-supplied firmware (see the sibling work item).

---

## Sources & References

- **Origin document:** [work/items/active/20260702-rpcs3-aka-source-plugin/rpcs3-settings-maximalist-proposal.md](work/items/active/20260702-rpcs3-aka-source-plugin/rpcs3-settings-maximalist-proposal.md)
- Sibling work item: `work/items/active/20260702-rpcs3-aka-source-plugin/` (the plugin itself)
- Settled overrides schema: `product/platform/library/config/records/library-item.ts`
- Reference plugin: `product/plugins/ryubing/src/{policy,materializer}.ts`
- Curated-policy model: `product/platform/library/config/inheritable-fields.ts` (`MoonlightPolicy`)
