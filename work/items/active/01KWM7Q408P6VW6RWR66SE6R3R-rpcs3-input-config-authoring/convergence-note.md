# U7 — Input authoring convergence note

**Purpose (R5).** Map RPCS3 input authoring onto the *already-landed*
cross-launcher preferences pattern, and draw the boundary with Korri's runtime
controller ownership, so Korri does not end up authoring pad maps two different
ways.

This is a design note, not built code. It feeds the active cross-emulator
vocabulary initiative (`work/items/active/01KWM7Q407…-cross-emulator-settings-vocabulary/`).

---

## 1. The pattern already exists (for settings)

The launcher-neutral preferences system shipped on trunk while this was planned:

- **Neutral schema:** `LaunchPreferences` / `Preferences` in
  `product/platform/library/config/inheritable-fields.ts` — `preferences.launch.{video,audio}`,
  folded like `MoonlightPolicy` across every cascade layer. The `preferences`
  namespace **explicitly reserves room for siblings** (the design names
  `preferences.display` as a future one).
- **Per-plugin translator:** `product/plugins/rpcs3/src/preferences-mapping.ts`
  — `translatePreferencesToRpcs3(launch)` produces a partial `settings.plugin`
  object; `resolveRpcs3PolicyInput({preferences, plugin})` deep-merges it
  **under** the plugin policy (plugin wins) and decodes once. Ryubing has the
  twin (`translatePreferencesToRyubing`).
- **Capability drop is emergent:** a preference a launcher can't honor is simply
  unmapped — no error, no key (see the aspect-ratio value-guard).
- **Design of record:** `…/01KWM7Q407…/design.md` (Phase 1 = video/audio only).

Input is **not yet** in the neutral vocabulary.

## 2. The input analogue: a reserved `preferences` sibling

A neutral controller-mapping vocabulary is the natural next sibling — call it
`preferences.input` (or `preferences.launch.input`). Shape it exactly like the
settings side:

```text
preferences.input (neutral, folded across layers)
        │
   translate<Launcher>Input(preferences.input)  ── per-plugin translator
        │   emits a partial Rpcs3Policy.input object
        ▼
   deep-merge UNDER settings.plugin."@korri:rpcs3".input   (plugin wins)
        │
   decodeRpcs3Policy(...)  ──►  routeInputConfig  ──►  input_configs/global/<name>.yml
```

Key point: **this plan's `Rpcs3Policy.input` (U2) is already the decode/merge
target** such a translator would feed. `materializer.ts` already routes decode
through `resolveRpcs3PolicyInput({preferences, plugin})`, so wiring a future
`preferences.input` translator is **additive** — no change to `input-mapping.ts`,
`input-config-render.ts`, or the materializer's write path. The only new code is
the neutral schema + a `translate…Input` function per launcher.

**What a neutral input vocabulary should carry** (the launcher-agnostic
intersection, mirroring how `preferences.launch` took the video/audio
intersection): a canonical button set (cross/circle/…/l1/r1/dpad/sticks), a
device-selection concept, and stick deadzone/trigger-threshold as portable
numerics. Handler backends (`evdev`/`sdl`/…) and binding-token grammars are
**launcher- and device-specific** and should stay under each plugin's own
`input` namespace — the same way `audio.backend`/`audio.device` stayed
launcher-specific in Phase 1.

**Capability drop applies unchanged:** a neutral binding a launcher can't
express is left unmapped by that launcher's input translator.

## 3. Boundary with runtime controller ownership (inputplumber)

There are two distinct jobs; keep them separate:

| Concern | Owner | Artifact |
|---|---|---|
| **Profile authoring** — what an emulator's pad map *says* | this plan (RPCS3), future neutral vocab | `input_configs/global/korri-*.yml` (a file RPCS3 reads) |
| **Runtime ownership** — physical pad discovery, hot-plug, exclusive grab, virtual-device shaping | `refactor/inputplumber-runtime-ownership` | live devices / evdev nodes at run time |

The seam between them is **device identity**. RPCS3's `cfg_player.Device`
matches on a device *name* string (on the Aka device today it is the Sunshine
virtual pad, `"Sunshine X-Box One (virtual) pad"`). Two failure modes to avoid:

1. **Double-authoring:** if inputplumber also starts writing emulator pad maps,
   Korri would author the same binding twice. Rule: **inputplumber owns the live
   device; the plugin (or neutral vocab) owns the emulator profile file.**
   inputplumber should not write `input_configs/`.
2. **Name drift:** the `Device` string the plugin writes must match whatever
   device inputplumber actually presents to RPCS3 at runtime. If inputplumber
   normalizes/renames devices (or presents a stable Korri virtual pad), that
   normalized name is the value a neutral `preferences.input` device selection
   should resolve to — so **one Korri-normalized device identity feeds both**
   the profile's `Device` field and inputplumber's runtime shaping.

Recommended: when the neutral input vocabulary is designed, define the
device-identity contract first (a Korri-stable controller name), and have both
the plugin input translator and inputplumber consume it. That keeps authoring
(this plan) and runtime (inputplumber) reading the same identity instead of
guessing device strings independently.

## 4. Recommended next step

Feed this note to `01KWM7Q407…`. Phase 1 there shipped `preferences.launch`
(video/audio). The input sibling is a clean Phase-N addition: neutral button/
device/stick vocabulary + a `translateRpcs3Input` (and `translateRyubingInput`,
etc.) that emits a partial `<Launcher>Policy.input`. No rework to this plan's
RPCS3 input surface is required — it was built as the merge target.
