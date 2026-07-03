# Cross-launcher launch preferences — design (Phase 1)

Derived from the two shipped launcher policies — RPCS3
(`product/plugins/rpcs3/src/{policy,mapping}.ts`) and Ryubing
(`product/plugins/ryubing/src/{policy,launch-spec}.ts`) — not guessed. This is
the documented derivation required by the backlog item (`item.md`).

## The idea

Common launch preferences are declared **once**, in launcher-neutral terms, at
any cascade layer, and each launcher translates them into its own native
config. Precedent: `MoonlightPolicy` in
`product/platform/library/config/inheritable-fields.ts` — a curated typed
policy living in the generic cascade, folded per nested key, that plugins map
down.

## Authoring shape

The block lives at `preferences.launch`, a sibling of `moonlight:` on every
cascade layer. The `preferences` namespace reserves room for future siblings
(e.g. `preferences.display` for the physical monitor / desktop resolution — a
different concern deliberately kept out of `launch`).

```yaml
preferences:
  launch:
    video:
      fullscreen: true
      resolution: { width: 1280, height: 720 }   # structured ints
      aspect-ratio: "16:9"                        # free string (phase 1)
    audio:
      volume: 70                                  # 0–100
```

Field names are kebab-case, matching the existing Ryubing policy style.

## Value shapes (and why)

| Preference | Shape | Rationale |
|---|---|---|
| `video.fullscreen` | `boolean` | Universally portable. |
| `video.resolution` | `{ width, height }` positive ints | Structured, type-checked — no string parsing. Copied from `MoonlightStreamPolicy.resolution`. |
| `video.aspect-ratio` | non-empty `string` | Aspect ratios are open-ended and cannot be a fixed list yet; kept a free string for now. |
| `audio.volume` | `number` in `[0, 100]` | Portable percentage. |

## Precedence

Resolution order (per the RPCS3 maximalist proposal §10):

1. Shared `preferences.launch` folds across all layers (deep-merge, scalars
   last-win) — the **base**.
2. Each launcher translates the folded preferences into its own native policy
   shape.
3. The launcher-specific `settings.plugin.<provider>` policy is deep-merged
   **on top** (plugin-specific **wins**).

**Phase 1 simplification (documented):** the shared tree and the launcher tree
are folded independently, then overlaid. A launcher-specific key at *any* layer
therefore beats a shared preference at *any* layer. Cross-layer specificity
*between* the two trees is not tracked. Revisit only if a real conflict case
demands per-field layer provenance.

## Capability drop is emergent, not special-cased

A launcher's translator only maps the preferences it can honor. A key it does
not list is simply never consumed — no error, no warning. This is why the
Switch is not a hardcoded exception:

| Preference | RPCS3 (`routeSettings`) | Ryubing (`renderRyubingConfig`) |
|---|---|---|
| `video.fullscreen` | `Miscellaneous.Start games in fullscreen mode` + `--fullscreen` | `start_fullscreen` + `--fullscreen` |
| `audio.volume` | `Audio.Master Volume` | `audio_volume` |
| `video.aspect-ratio` | `Video.Aspect ratio` (only `16:9`/`4:3`; others dropped) | **dropped** — see deferrals |
| `video.resolution` | `Video.Resolution` (`"1280x720"`) | **dropped** — no absolute-pixel capability |

The RPCS3 translator additionally guards *values*: it forwards `aspect-ratio`
only when RPCS3's native `video_aspect` enum can express it (`16:9`, `4:3`) and
drops anything else — the same silent-discard rule applied to a value rather
than a key.

## Where translation lives

Each launcher owns a small `preferences-mapping.ts`:

- `translatePreferencesToRpcs3` / `translatePreferencesToRyubing` — pure
  functions producing that launcher's own authoring object.
- `resolveRpcs3PolicyInput` / `resolveRyubingPolicyInput` — deep-merge the
  translated preferences under the plugin policy, returning the raw object the
  launcher already knows how to decode.

Existing native paths (`routeSettings`, `renderRyubingConfig`) are reused
unchanged; the neutral→native value logic lives only in the translator.

## Deferrals (vocabulary grows over time)

- **Ryubing `aspect-ratio`** — Ryubing's native aspect vocabulary differs from
  the shared strings (`16:9` vs e.g. `Fixed16x9`). No verified value map exists
  in the repo, so Phase 1 drops it rather than emitting an unverified value.
  A verified Ryubing aspect value map is a Phase 2 item.
- **A neutral "quality/scale" concept** — the Switch's real equivalent of
  "resolution" (docked/handheld base × `resolution-scale`) plus RPCS3's
  `Resolution Scale`. Deferred until a neutral value domain is designed.
- **`frame-limit`, `vsync`, `language`** — portable with per-launcher value
  maps; added in a later phase.
- **`audio.backend` / `audio.device`** — no shared value domain (RPCS3
  cubeb/faudio vs Ryubing openal/sdl2; host-specific device strings). Stay
  launcher-specific under `settings.plugin`.
- **`preferences.display`** — physical monitor / desktop resolution. Namespace
  reserved, empty in Phase 1.

## Verification

`product/platform/library/config/launch-preferences.integration.test.ts` proves
the end-to-end payoff: a shared block set once at the user layer resolves onto
both an RPCS3 and a Ryubing release, RPCS3 honors resolution while Ryubing drops
it, and a launcher-specific release setting overrides the shared value for that
launcher only.
