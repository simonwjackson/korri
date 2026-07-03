# RPCS3 settings — maximalist config-surface proposal

Status: proposal (pre-implementation)
Scope: how to express the full RPCS3 launcher settings surface in Korri's
`settings.plugin` cascade for `@korri:rpcs3`. This is the "max out the
launcher settings + cascade" step. Lifting shared concepts into a
normalized cross-emulator space is a **follow-up**, previewed in §10.

---

## 1. Goal

Today the RPCS3 plugin ships the *bare minimum* policy: `command`,
`state.root`, `firmware.sentinel`, `env`, `extra.args`
(`product/plugins/rpcs3/src/policy.ts`). Everything that actually shapes
an RPCS3 boot — renderer, resolution, audio backend, CPU accuracy,
fullscreen, popup suppression, language — is either hand-edited on the
device (`~/.config/rpcs3/config.yml`, `GuiConfigs/CurrentSettings.ini`)
or hard-coded in `--no-gui`.

The goal: make **every** meaningful RPCS3 setting declarable in Korri
config under `<layer>.settings.plugin`, so that placing a value there is
converted by the plugin into the right **config file key** or **CLI
flag** — declaratively, validated, and cascade-merged across every
config layer.

---

## 2. How settings flow today (the mechanism we build on)

The plumbing already exists and is generic. Authoring path:

```
app.settings.plugin.{...}          # authored here (any cascade layer)
  └─ pluginPolicyFromSettings()    # readable-cascade-resolver.ts
       → plugin["@korri:rpcs3"]    # PluginPolicyMap entry
         └─ foldPluginPolicies()   # cascade deep-merge (arrays concat,
            (cascade-resolver.ts)    objects deep-merge, scalars last-win)
             → context.plugin["@korri:rpcs3"]
               └─ decodeRpcs3Policy(...)   # policy.ts (materializer input)
```

Key facts that make this the right substrate:

- **`settings.plugin` is the authoring key.** `pluginPolicyFromSettings`
  (in `readable-cascade-resolver.ts`) lifts `settings.plugin` into the
  provider-keyed `plugin` map for the launcher's own plugin id. So
  `<launcher>.settings.plugin.video.renderer` reaches the RPCS3
  materializer with zero new wiring.
- **The cascade is already maximal.** `foldPluginPolicies` deep-merges
  the plugin policy across host → user → system → app → runtime →
  library-item → contained → release → profile → override. We do **not**
  need new cascade code to "max out the cascade" — we need a **rich
  policy schema** so there is something worth merging.
- **Release-layer safety already exists.** `stripContentPathOverride`
  prevents a release from smuggling a `content.path`. Our schema should
  lean on the same idea (operator-only keys vs release-safe keys).

So the work is almost entirely: **(a) a much richer typed policy schema**
and **(b) a materializer that turns it into a `config.yml` + CLI flags**.

---

## 3. The full RPCS3 surface (ground truth from our build)

Captured live from Aka's `~/.config/rpcs3/config.yml`
(RPCS3 0.0.41-nixpkgs-40e9ee5) plus `rpcs3 --help`. Three materialization
channels exist, and the proposal must cover all three:

### 3a. `config.yml` (the big one) — 10 top-level sections

**Format: YAML** (parsed by yaml-cpp), *not* INI. Nested mappings
(`Section:` → two-space-indented `Key: Value`), booleans, ints, quoted
strings, hex strings, and sub-maps. This dictates that the RPCS3
`overrides.config.append` escape hatch (§4a/§5) is a **YAML** text blob —
the string format is always whatever the target emulator's config file
uses (RPCS3 YAML; RetroArch line `key = value`; MAME/Dolphin INI; Ryubing
JSON).

| Section | Nature | Examples (high-value) |
|---|---|---|
| `Core` | CPU accuracy/threading | PPU/SPU Decoder, PPU Threads, SPU Block Size, SPU XFloat Accuracy, `Libraries Control` (LLE list) |
| `VFS` | virtual filesystem | Enable /host_root/, disk cache size |
| `Video` | renderer + nested | Renderer, Resolution, Aspect ratio, Frame limit, VSync Mode, Shader Mode, Resolution Scale, `Vulkan:` (Adapter, Exclusive Fullscreen Mode), `Performance Overlay:`, `Shader Loading Dialog:` |
| `Audio` | backend | **Renderer (Cubeb/…)**, **Audio Device**, Audio Format, Master Volume, buffering |
| `Input/Output` | device handlers | Keyboard, Mouse, Move, Pad handler mode |
| `System` | locale/console | License Area, Language, Enter button assignment, Console time offset |
| `Net` | networking | Internet enabled, DNS address, PSN status |
| `Savestate` | savestates | Start Paused, Save Disc Game Data |
| `Miscellaneous` | boot/UX | **Automatically start games after boot**, **Exit RPCS3 when process finishes**, **Start games in fullscreen mode**, Show *hints, Show fatal error hints |
| `Log` | per-channel log levels | `{}` (map of channel → level) |

Notes:
- Nested subtrees (`Video.Vulkan`, `Video.Performance Overlay`,
  `Video.Shader Loading Dialog`, `Video.Custom Anaglyph Matrices`) are
  objects, not scalars.
- Keys are **human-facing strings with spaces and mixed case** — hostile
  to hand-type in Korri config. This drives the "curated names" decision
  (§4).
- Some values are enum-ish strings ("Recompiler (LLVM)", "Vulkan",
  "1280x720", "16:9"); some are bool; some are ints; some are hex
  strings; some are lists/maps.

### 3b. CLI flags (`rpcs3 --help`, our exact build)

Launch-shape flags — these are **not** in config.yml and must be argv:

- `--no-gui`, `--headless`, `--fullscreen` (only honored with `--no-gui`)
- `--game-screen <index>`, `--user-id <id>`
- `--config <path>` → **"use this configuration file for CLI-booted
  game"** — the hook that lets us materialize a per-launch `config.yml`.
- `--input-config <name>` → per-launch input config
- `--savestate <path>`, `--installfw <path>`, `--installpkg <path>`
- trailing `(S)ELF [Args...]` / `-- <args>` passthrough

### 3c. `GuiConfigs/CurrentSettings.ini` (Qt GUI state)

The popup toggles we hand-edited (infoBox*/confirmationBox*) live here,
**not** in config.yml, and `--config` does **not** cover them. Under
`--no-gui`/`--headless` most are moot, but a few (fatal-error hint) still
surface. So GuiConfigs is a **state-root preseed** concern, distinct from
the per-launch `--config` file — but this is an *internal delivery detail*.
The author sets e.g. `boot.suppressPopups: true` as a normal unified
setting (§5); the plugin routes it to `CurrentSettings.ini`, ending the
out-of-band manual edit.

### 3d. Emulator state dir (env-driven, not a flag)

RPCS3 has **no `--config-dir`**. dev_flash/firmware/hdd/save state live
under the emulator config dir = `$XDG_CONFIG_HOME/rpcs3` (or `$HOME`).
Relocating state = setting env (`XDG_CONFIG_HOME`/`HOME`), **not** a flag.
So `state.root` in policy is fundamentally an **env-materialized** value,
while `config.yml` is **flag-materialized** (`--config`). The proposal
keeps these as separate, clearly-labelled channels.

---

## 4. Schema design: three options

**Option A — Verbatim passthrough.** Mirror RPCS3's exact YAML keys:
`settings.plugin.config.Video.Renderer = "Vulkan"`. 
*Pros:* complete, zero-maintenance, no translation layer.
*Cons:* leaks emulator string keys (spaces/case) into Korri config; no
validation; no stable Korri vocabulary; can't normalize later.

**Option B — Curated typed policy only.** Hand-author a typed schema like
`MoonlightPolicy`: `video.renderer`, `video.resolution`, `audio.backend`.
*Pros:* typed, validated, clean, normalizable, self-documenting.
*Cons:* maintenance burden; the long tail (~200 keys) is unreachable
until modeled.

**Option C — Hybrid (recommended).** Curated typed policy for the
common/normalizable surface **plus** the settled `overrides.config`
escape hatch — **plain text** (`prepend`/`append`/`replace` strings)
applied to the materialized config file. `config.append` is a *string*,
not a structured object — the break-glass channel for anything Korri does
not yet model, working for any config format because it is text.
*Pros:* ergonomic + validated for the 90%; the tail is reachable with
zero schema work; format-agnostic; uses the already-settled
`LaunchOverrides` vocabulary (`records/library-item.ts:118`).
*Cons:* operator-owned text (Korri does not validate inner shape);
precedence is "last write wins" per the file format (§8); `LaunchOverrides`
still needs wiring (§4a-bis).

**Recommendation: Option C**, with `overrides.config.append` as the
plain-text hatch — not Ryubing's structured JSON merge (that shape only
works because Ryubing's config is JSON; the universal contract is text).

---

## 4a. Structural rule: `command` / `env` / `extra` are STANDARD settings, not plugin policy

Validated against the real fixture `fixtures/steam-full.korri.yaml`:
`command` and `plugin` (which-plugin) are **launcher-record fields**
(siblings of `settings:`); only genuinely plugin-specific policy belongs
under `settings.plugin`. Today Steam/Ryubing/RPCS3 wrongly bury generic
concepts (`extra`, and RPCS3 even `command`) **inside** `settings.plugin`.

**Corrected placement** (updated after auditing the other plugins — see
§4a-bis for the settled `LaunchOverrides` vocabulary):

| Concept | Home | Notes |
|---|---|---|
| `command` | launcher-record field | already standard; RPCS3 must stop duplicating it under `settings.plugin.command` |
| `env` | launcher-record field (lifted) | already standard; only rpcs3/ryubing wrongly re-declare it under `.plugin` |
| args passthrough | `overrides.args.{prepend,append,replace}` | the **settled** `LaunchOverrides` shape (not a new `extra.args`) |
| raw config text | `overrides.config.{prepend,append,replace}` | **string-valued**; `config.append` == the plain-text escape hatch |
| unified semantic settings (`video`/`audio`/`core`/`system`/`net`/`boot`) + `state`/`firmware` | `settings.plugin.*` | genuinely RPCS3-specific; delivery hidden |

The raw config override is **format-agnostic**: `config.append` is a raw
string in *whatever* format the target launcher's config file uses (YAML
for RPCS3, JSON/TOML/INI for others). Korri is cross-format, so encoding
raw config as a string — not a structured object — is the correct universal
choice, and the schema already reflects it (`config` is `Schema.String`
triple in `LaunchOverrides`).

---

## 4a-bis. Audit of the other plugins (env / extra / args)

- **`env`** lives at the standard launcher/record level (`InheritableLayer`
  field on `AppRecord`/`LauncherRecord`/`ReleaseLaunch`/`LaunchBlock`).
  Only **rpcs3** and **ryubing** re-declare a plugin-level `env`; all
  others consume the lifted `context.env`. → RPCS3 should drop plugin-level
  `env` and use `context.env`.
- **`extra`** has **no settled home**: only ryubing/steam/rpcs3 have it,
  all under `settings.plugin.extra`; RetroArch instead uses
  `extraSettings`/`extraArgs`/`configFile.append`. It is a legacy
  per-plugin idiom, **not** a standard.
- **args prepend/append/(replace)** *is* settled as a schema:
  `LaunchOverrides` (`records/library-item.ts:118`), attached as
  `ReleaseLaunch.overrides` (line 145):
  `args: { prepend[], append[], replace[] }` and
  `config: { prepend, append, replace }` (strings). The third verb is
  **`replace`**, not "template" (rocknix's `args.template` is a separate
  full-command template concept).
- **Wiring gap / risk:** `LaunchOverrides` is defined but **not consumed**
  by `cascade-resolver.ts` (it still reads the flat `argsAppend`). So
  adopting `overrides.args`/`overrides.config` for RPCS3 requires **wiring
  the resolver + readable context to surface overrides** — a real
  dependency, called out in §12.

**Convergence decision:** align the RPCS3 raw-passthrough hatches to the
settled `LaunchOverrides` names (`overrides.args`, `overrides.config`)
rather than invent `settings.extra`. The plugin reads the resolved
overrides (once wired) and applies `config.{prepend,append,replace}` to
its materialized config file and `args.{prepend,append,replace}` to argv.

---

## 4b. Decision (superseding earlier drafts)

Earlier drafts flip-flopped: first "drop `env`/`extra` as redundant," then
"keep a plugin-level `extra` like Ryubing/Steam." The audit in §4a-bis
settles it:

- **`env`** → standard launcher-record field; RPCS3 uses `context.env`,
  no plugin-level `env`.
- **args / raw-config passthrough** → the **settled** `LaunchOverrides`
  shape: `overrides.args.{prepend,append,replace}` and
  `overrides.config.{prepend,append,replace}` (config string-valued).
  Not a new `settings.extra`, and not a plugin-buried `extra`. The
  raw-config string is the format-agnostic break-glass hatch
  (`config.append`).
- **`settings.plugin`** holds only RPCS3-specific policy as **one unified
  semantic tree** (§5) — no `cli`/`config`/`gui` split.
- **Caveat:** `LaunchOverrides` is schema-settled but not yet wired to the
  resolver (§4a-bis) — a dependency, not a blocker (§12).

---

## 5. Proposed authoring shape for `@korri:rpcs3`

`settings.plugin` is **one unified, semantic settings tree**. The author
declares *what* they want; the plugin decides *how* to deliver each
setting (CLI flag, `config.yml` key, or GUI ini). Delivery is an
implementation detail and is **never** surfaced in the schema — there is
no `cli:`/`config:`/`gui:` split. Generic `command`/`env`/`extra` stay at
the standard level (§4a).

```yaml
launchers:
  "@korri:rpcs3/rpcs3":
    plugin: "@korri:rpcs3"                       # which plugin (record field)
    command: /run/current-system/sw/bin/rpcs3    # STANDARD launcher field
    systems: [ps3]
    env:                                          # STANDARD (lifted) launcher field
      SOME_VAR: "1"
    # == STANDARD break-glass overrides (settled LaunchOverrides shape) ==
    # (currently release-scoped; see wiring gap in §4a-bis / §12)
    overrides:
      args:
        append: ["--verbose-curl"]   # also: prepend / replace
      config:
        append: |                     # raw native-format text (YAML here)
          Video:
            Force High Precision Z buffer: true

    settings:
      # == UNIFIED plugin settings: ONE place, delivery is internal ==
      plugin:
        video:
          renderer: vulkan            # (plugin -> config.yml Video.Renderer)
          resolution: "1280x720"
          aspectRatio: "16:9"
          fullscreen: true            # (plugin -> --fullscreen flag)
          vsync: false
          resolutionScale: 100
          shaderMode: async-multi
        audio:
          backend: cubeb              # (plugin -> config.yml Audio.Renderer)
          device: "@@@default@@@"
          masterVolume: 100
        core:
          ppuDecoder: llvm-recompiler
          spuDecoder: llvm-recompiler
          spuBlockSize: safe
          spuXFloatAccuracy: approximate
          librariesControl: []
        system:
          language: en-US
          licenseArea: SCEA
          enterButton: cross
        net:
          internet: disconnected
          dns: "8.8.8.8"
        boot:
          headless: false            # (plugin -> --headless flag)
          screen: 0                  # (plugin -> --game-screen flag)
          user: "00000001"           # (plugin -> --user-id flag)
          autoStart: true            # (plugin -> config.yml Miscellaneous)
          exitOnFinish: true
          suppressPopups: true       # (plugin -> GuiConfigs ini)
          showFatalErrorHints: false
        state:
          root: "{storage:@korri:rpcs3/state}"
        firmware:
          sentinel: dev_flash/sys/external/liblv2.sprx
```

Every leaf above is a plain semantic setting. The parenthetical delivery
notes are **not** part of the schema — they are what the plugin's mapping
table (§9) resolves internally. `fullscreen`, `renderer`, and
`suppressPopups` are declared identically; that one lands in argv, one in
`config.yml`, and one in the GUI ini is invisible to the author.

`overrides.config.append` (the settled `LaunchOverrides` field, **not** a
new `settings.extra`) is an opaque **string** in the launcher's native
config format — YAML for RPCS3 — appended unmodified after everything
Korri generates. `prepend`/`replace` are also available. It is the
break-glass hatch for keys we do **not** yet model; Korri does not parse
or validate its contents. Because the format is per-emulator, this same
field carries YAML for RPCS3, cfg lines for RetroArch, INI for
MAME/Dolphin, etc. (Note: `LaunchOverrides` is defined but not yet
consumed by the resolver — §4a-bis wiring gap.)

### Internal delivery channels (NOT author-facing)

Authors write one unified `settings.plugin` tree. Internally the
materializer routes each resolved setting to one of these delivery
channels via the mapping table (§9). **This table is an implementation
detail; none of it appears in the authoring schema.**

| Delivery channel | How it reaches RPCS3 | Example unified settings routed here |
|---|---|---|
| argv flag | CLI arg on the process | `video.fullscreen`→`--fullscreen`, `boot.headless`→`--headless`, `boot.screen`→`--game-screen`, `boot.user`→`--user-id` |
| config.yml key | materialized file via `--config` | `video.renderer`, `audio.backend`, `core.*`, `system.*`, `net.*`, `boot.autoStart` |
| GUI ini key | `CurrentSettings.ini` (state root) | `boot.suppressPopups`, `boot.showFatalErrorHints` |
| env var | process env | `state.root`→`XDG_CONFIG_HOME`/`HOME` |
| preflight assert | gate before launch | `firmware.sentinel` |

Standard (non-plugin) settings and their delivery: `command`→argv[0];
`env`→process env; `overrides.args`→raw argv (prepend/append/replace);
`overrides.config`→raw text applied to the config file
(prepend/append/replace).

---

## 6. Materialization plan (what the RPCS3 materializer does)

Extend `materializeReadableRpcs3Resources` (`materializer.ts`) to, in
order. The materializer walks the **one** unified `Rpcs3Policy` tree and,
per the mapping table (§9), routes each setting to its delivery channel —
argv flag, `config.yml` key, GUI ini, env, or preflight assertion. The
author never chose a channel.

1. **Decode** the unified `Rpcs3Policy` (see §7) via `decodeRpcs3Policy`
   (a real Effect Schema, strict, typed errors).
2. **Resolve tokens** (`{storage:…}`) — already implemented; extend to
   apply inside setting string values too.
3. **Assert preflight** — absolute command, readable game folder,
   readable state root, firmware sentinel (all already present).
4. **Route each unified setting** through the mapping table into three
   buckets: argv flags, `config.yml` keys, GUI ini keys.
5. **Build `config.yml`**:
   - Start from a **known-good baseline** (captured from our working Aka
     config, committed under `product/plugins/rpcs3/assets/config.baseline.yml`,
     documented as operator-supplied-defaults, **not** firmware/assets).
   - Serialize the config-routed settings to YAML text (from a known-good
     baseline captured from Aka, committed under
     `product/plugins/rpcs3/assets/config.baseline.yml`, documented as
     operator-supplied-defaults, **not** firmware/assets).
   - **Apply `overrides.config`** (settled `LaunchOverrides`): `prepend`
     text before, `append` text after (verbatim, no parse/merge), or
     `replace` the whole file. `append` is the common escape hatch. Read
     from the resolved release overrides (requires wiring — §4a-bis).
   - Write to the launch artifact dir (reuse `KORRI_LAUNCH_ARTIFACTS_DIR`
     plumbing like MAME/Dolphin `iniConfig`), emit `--config <path>`.
   - *Open Q (§8):* baseline-overlay vs partial-file. RPCS3 fills missing
     keys with built-in defaults, so a **partial** file may suffice and is
     simpler/more robust across versions. Prefer partial unless testing
     shows RPCS3 wipes unspecified keys.
6. **Assemble argv** — the flag-routed settings + `--config`/
   `--input-config` + `overrides.args` (`prepend` before the base argv,
   `append` after, or `replace`). `composeRpcs3LaunchSpec` stays the
   single argv authority.
7. **GUI preseed** — write/patch `CurrentSettings.ini` under the state
   root from the ini-routed settings (idempotent, only when present).
   Replaces the earlier manual edit.
8. **Env** — use the standard lifted `context.env`, then add the
   plugin-*produced* `XDG_CONFIG_HOME`/`HOME` derived from
   `state.root`. (No plugin-level `env` field.)

`composeRpcs3LaunchSpec` stays the choke point for argv; the config file
is a side artifact referenced by `--config`.

---

## 7. Typed policy shape (Effect Schema, replaces hand-rolled decoder)

`policy.ts` graduates from manual `isRecord` checks to an Effect
`Schema.Struct` (like `MoonlightPolicy` in `inheritable-fields.ts`),
giving decode-time validation + good errors + strict excess-property
rejection for the curated keys. Structurally like `MoonlightPolicy`. The
tree is grouped by **semantic domain** (video/audio/core/system/net/boot/
state/firmware) — **never** by delivery mechanism. There is deliberately
**no** `cli`/`config`/`gui` node; whether a leaf becomes a flag, a config
key, or an ini entry is decided by the mapping table (§9), not the
schema. Sketch — **plugin policy only** (`settings.plugin`); `command`/
`env`/`extra` are standard and decoded elsewhere:

```
# settings.plugin.* — ONE unified, semantic RPCS3 settings tree
Rpcs3Policy = Schema.Struct({
  video:    optional(Rpcs3VideoPolicy),    # renderer/resolution/aspectRatio/fullscreen/vsync/...
  audio:    optional(Rpcs3AudioPolicy),    # backend/device/masterVolume/...
  core:     optional(Rpcs3CorePolicy),     # ppuDecoder/spuDecoder/spuBlockSize/...
  system:   optional(Rpcs3SystemPolicy),   # language/licenseArea/enterButton/...
  net:      optional(Rpcs3NetPolicy),      # internet/dns/...
  boot:     optional(Rpcs3BootPolicy),     # headless/screen/user/autoStart/exitOnFinish/suppressPopups/...
  state:    optional(Struct({ root: NonEmptyString })),
  firmware: optional(Struct({ sentinel: optional(NonEmptyString) })),
})
# Each leaf carries a delivery tag in the mapping table (§9), e.g.
#   video.fullscreen  -> argv flag  (--fullscreen)
#   video.renderer    -> config.yml (Video.Renderer)
#   boot.suppressPopups -> GUI ini
# The author sees none of that.

# STANDARD settings (generic, NOT plugin-specific):
#   command : launcher-record field (AbsolutePath)
#   env     : launcher-record field (StringRecord, lifted)
#   overrides.args   = { prepend: string[], append: string[], replace: string[] }
#   overrides.config = { prepend: string,   append: string,   replace: string }
#     - config is the opaque native-format text (YAML for RPCS3);
#       config.append is the break-glass hatch for unmodeled keys
#     - this is the SETTLED LaunchOverrides shape (library-item.ts:118),
#       not a per-plugin `extra` (see 4a-bis)
```

`LaunchOverrides` is the shared, cross-plugin vocabulary — the plugin
consumes the resolved overrides rather than declaring its own `extra`.

Enums (renderer, resolution, decoders, aspect ratio, language, …) become
`Schema.Literals` with a **value map** to the RPCS3 string (§9), so Korri
speaks `vulkan` and the file gets `Vulkan`.

---

## 8. Precedence & merge rules

- **Across cascade layers:** the plugin policy deep-merges via
  `foldPluginPolicies` (objects deep, arrays concat, scalars last-win).
  `overrides.config.*` values are **string scalars**, so across layers
  they are **last-write-wins** (a more-specific layer replaces the text;
  layers do not concatenate). Document this so authors know
  `overrides.config.append` is not additive across layers.
- **Within the file / final apply:** config-routed settings first, then
  the `overrides.config.append` YAML text appended last. **YAML append
  caveat:** because the file is YAML, appending a top-level section that
  already exists (e.g. a second `Video:`) makes yaml-cpp keep the **last**
  whole mapping for that key — which would *drop* the earlier keys under
  it. So `config.append` is for **sections/keys we don't already emit**;
  to override a curated key, set the curated field, not a duplicate
  section. (If this proves too sharp an edge later, the
  materializer can parse+deep-merge the YAML instead of naive append —
  noted as a possible refinement, out of scope for Phase 1.)
- **Overlapping delivery is the plugin's problem, not the author's:**
  `video.fullscreen` maps to both a `--fullscreen` flag and a
  `Miscellaneous.Start games in fullscreen mode` config key. The mapping
  table picks the authoritative one (flag for headless launches) and, if
  useful, sets both consistently. The author sets `video.fullscreen: true`
  once and never learns there were two mechanisms.
- **Release-layer safety:** reuse the `stripContentPathOverride` pattern —
  releases may set semantic `settings.plugin.*` and `overrides.*` but
  **not** `command`, `state.root`, or `env` (operator/host-only). Enforce
  an allowlist in `readableViewOfRelease` for `@korri:rpcs3`.

---

## 9. Mapping table (unified setting → delivery + target)

This table is where the delivery mechanism actually lives — it is internal
to the plugin. Each unified `settings.plugin` leaf carries a **delivery**
(`flag` | `config` | `ini` | `env` | `assert`) and a target + value map.
Illustrative core rows (full table authored during implementation).

| Unified setting | Delivery | Target | Value map |
|---|---|---|---|
| `video.renderer` | config | `Video.Renderer` | `vulkan→Vulkan`, `opengl→OpenGL`, `null→Null` |
| `video.resolution` | config | `Video.Resolution` | verbatim `"1280x720"` |
| `video.aspectRatio` | config | `Video.Aspect ratio` | verbatim `"16:9"`/`"4:3"` |
| `video.vsync` | config | `Video.VSync Mode` | `true→Vertical Sync`, `false→Disabled` |
| `video.resolutionScale` | config | `Video.Resolution Scale` | int |
| `video.fullscreen` | **flag** | `--fullscreen` | present when true |
| `audio.backend` | config | `Audio.Renderer` | `cubeb→Cubeb`, `faudio→FAudio`, `null→Null` |
| `audio.device` | config | `Audio.Audio Device` | verbatim |
| `audio.masterVolume` | config | `Audio.Master Volume` | int |
| `core.ppuDecoder` | config | `Core.PPU Decoder` | `llvm-recompiler→Recompiler (LLVM)`, … |
| `core.spuDecoder` | config | `Core.SPU Decoder` | `llvm-recompiler→Recompiler (LLVM)`, … |
| `core.spuBlockSize` | config | `Core.SPU Block Size` | `safe→Safe`, `mega→Mega`, `giga→Giga` |
| `system.language` | config | `System.Language` | `en-US→English (US)`, … (enum map) |
| `system.licenseArea` | config | `System.License Area` | `SCEA`/`SCEE`/`SCEJ` verbatim |
| `net.internet` | config | `Net.Internet enabled` | `connected→Connected`, `disconnected→Disconnected` |
| `boot.headless` | **flag** | `--headless` | present when true |
| `boot.screen` | **flag** | `--game-screen` | int arg |
| `boot.user` | **flag** | `--user-id` | string arg |
| `boot.autoStart` | config | `Miscellaneous.Automatically start games after boot` | bool |
| `boot.exitOnFinish` | config | `Miscellaneous.Exit RPCS3 when process finishes` | bool |
| `boot.suppressPopups` | **ini** | `CurrentSettings.ini` infoBox*/confirmationBox* | bool group |
| `boot.showFatalErrorHints` | config | `Miscellaneous.Show fatal error hints` | bool |
| `state.root` | **env** | `XDG_CONFIG_HOME`/`HOME` | path |
| `firmware.sentinel` | **assert** | preflight path check | path |

The tail (every RPCS3 key not modeled above) is reachable by writing
verbatim RPCS3 YAML lines into `overrides.config.append` **text blob** —
the only place the raw config format is ever exposed.

---

## 10. Preview: lifting into the normalized space (next step, not now)

Once RPCS3 is fully expressible, the following keys are the obvious
**cross-emulator normalization candidates** — they exist for RetroArch,
Ryubing, Dolphin, RPCS3 alike, and should graduate into a shared typed
policy (sibling of `MoonlightPolicy`) that each plugin maps down:

- `video.renderer` (vulkan/opengl/…)
- `video.resolution` / `video.resolutionScale`
- `video.aspectRatio`
- `video.vsync`
- `audio.backend` / `audio.device` / `audio.masterVolume`
- `system.language`
- `cli.fullscreen` / `cli.headless`
- `misc.exitOnFinish` (map to each emulator's "quit when game exits")

Crucially, the normalization pass is **also** where the per-plugin
`extra`/`env` idioms get reconciled with the settled `LaunchOverrides`
(`overrides.args`/`overrides.config`) and lifted `env`/`argsAppend`
(today Ryubing/Steam/RPCS3 each re-declare `extra`; `LaunchOverrides`
sits defined-but-unwired). Do this once, fleet-wide — not unilaterally in
RPCS3.

The normalized layer would resolve first, then each plugin's unified
settings, then `overrides.config`. That keeps a single Korri vocabulary for
"720p, Vulkan, stereo, English, fullscreen, exit-on-quit" across the
whole fleet — which is the end goal the user described. **Deferred** until
the RPCS3-specific surface here is landed and validated.

---

## 11. Phased delivery (by user-facing importance)

The build is phased by **how much people care about a setting**, not by
delivery mechanism. Earlier phases are the small, cross-launcher set most
people have an opinion on; later phases march toward settings that are
sane defaults nobody touches. The **raw escape hatch is present from the
start** (Phase 0), so every later phase merely *upgrades* a raw setting
into a nicely-named, validated one — it never unblocks something that was
previously impossible.

### Phase 0 — Foundation & boot essentials

Not "opinion" settings, but the emulator will not run unattended without
them. Ships first:

- plugin plumbing, the unified-settings decoder, and the internal
  delivery router (argv / `config.yml` / GUI ini);
- `config.yml` materialization + `--config`, `state`/`firmware` gating;
- the **raw escape hatch** — `overrides.args` and `overrides.config`
  (`prepend`/`append`/`replace`) — so anything unmodeled is reachable
  day one (depends on wiring `LaunchOverrides`, §13 Q6);
- the functional headless-boot flags: no-gui, headless/fullscreen,
  exit-when-game-closes, popup suppression.

### Phase 1 — "Everyone has an opinion" (and common to every launcher)

The shortlist people actually reach for, worded the same across
RetroArch / RPCS3 / Ryubing / Dolphin — i.e. the cross-launcher
normalization set (§10).

| Unified setting | Delivery | RPCS3 target |
|---|---|---|
| `display.resolution` | config | `Video.Resolution` |
| `display.aspectRatio` | config | `Video.Aspect ratio` |
| `display.fullscreen` | flag | `--fullscreen` |
| `performance.frameLimit` | config | `Video.Frame limit` |
| `performance.vsync` | config | `Video.VSync Mode` |
| `audio.volume` | config | `Audio.Master Volume` |
| `audio.device` | config | `Audio.Audio Device` |

### Phase 2 — Power-user common

Changed by a fair number of people, not everyone:

- graphics backend (Vulkan/OpenGL) — `Video.Renderer`
- internal resolution scale — `Video.Resolution Scale`
- anisotropic filter — `Video.Anisotropic Filter Override`
- shader mode — `Video.Shader Mode`
- audio backend (Cubeb/FAudio) — `Audio.Renderer`
- language / region — `System.Language`, `System.License Area`

### Phase 3 — Per-game tuning

Knobs people flip for a *specific* troublesome game:

- CPU: PPU/SPU decoder, SPU block size, SPU XFloat accuracy, preferred
  SPU threads, clock scale
- GPU accuracy: write/read color & depth buffers, strict rendering mode,
  MSAA, ZCULL
- `Libraries Control` (LLE selection)

### Phase 4 — Sane defaults nobody touches

Deep accuracy, debug, networking, savestate, VFS cache, and logging.
These stay at their known-good baseline defaults; we only give them
nice names on demand. Until then they are reachable via
`overrides.config.append`.

---

## 12. Scope / non-goals for Phase 1

**In scope (Phases 0-1):** enriched `Rpcs3Policy` schema (Effect Schema)
as **one unified semantic tree** — no cli/config/gui split; mapping table
with delivery tags + value maps; materializer routes each setting to
argv / `config.yml` / GUI ini, writes `config.yml` (partial or baseline)
then applies `overrides.config` (`append`/`prepend`/`replace`), passes
`--config`; assembles argv flags + `overrides.args`; preseeds
`CurrentSettings.ini`; token resolution inside settings; tests (policy
decode, mapping/delivery routing, materializer argv/file, cascade merge,
`overrides.config.append` applied verbatim); README. **Depends on** the
`LaunchOverrides` wiring (§13 Q6).

**Out of scope (this slice):** Phases 2-4 curated settings (reachable via
the escape hatch meanwhile); the normalized cross-emulator policy (§10);
Android/Z-Fold, Bandai/SM8550 RPCS3, or tuning specific games; bundling
firmware/assets; input-config *content* authoring (only wire
`--input-config <name>` passthrough now).

---

## 13. Open questions for the user

1. **Schema philosophy:** confirm the **unified semantic tree** — curated
   typed sections grouped by domain (display/performance/audio/…),
   delivery hidden — with raw passthrough via the settled
   `overrides.args`/`overrides.config`, over pure passthrough or pure
   curated.
2. **config.yml strategy:** **partial `--config` file** (rely on RPCS3
   defaults; simplest) vs **committed baseline + overlay** (deterministic,
   version-proof, but carries an operator-defaults asset). Recommend
   starting partial, promote to baseline if RPCS3 drops unspecified keys.
3. **Phase 1 setting list:** confirm the seven Phase 1 settings above
   (resolution, aspect ratio, fullscreen, frame limit, vsync, audio
   volume, audio device), or adjust the shortlist.
4. **`command` override:** keep `settings.plugin.command` as a
   plugin-level override, or drop it in favour of the app-record
   `command` (top-level)? Leaning keep-for-now (harmless, already used).
5. **Lifted `argsAppend` vs `overrides.args`:** two args-append surfaces
   exist (`argsAppend`, unwired `overrides.args`). Adopt `overrides.args`
   for RPCS3, keep honoring `argsAppend` too, or pick one?
6. **`LaunchOverrides` wiring (dependency):** `overrides.args`/
   `overrides.config` are schema-settled but **not consumed** by the
   resolver. Confirmed we want it in Phase 0 (not skipped) — wire the
   resolver + readable context to surface `overrides` as part of this
   slice.
