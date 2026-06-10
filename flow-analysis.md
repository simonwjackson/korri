# Flow Analysis: Config Graph Migration (KORRI_LIBRARY_ROOT → KORRI_CONFIG_ROOTS)

> **Scope:** Pre-implementation spec review for the migration from a singleton
> `KORRI_LIBRARY_ROOT` / `services.korri.daemon.library.root` / `/api/library/events`
> model to a ProseQL 0.14.0 `documentGraph`-backed config graph with
> `KORRI_CONFIG_ROOTS` / `services.korri.config.roots` / `/api/config/events` and
> KORRID last-known-good lifecycle.
>
> **Date:** 2026-06-10  
> **Branch:** trunk  
> **Deferred out of scope:** generic removable-media roots; authoring/write-target semantics
> (parking-lot items `01KTRYCA2EC1DBW6RJXPC4NJV4`, `01KTRYCK5XYMCSVYD55P7XWBDY`)

---

## User Flows

### Flow 1 — Korrid startup

```
env: KORRI_CONFIG_ROOTS set?
  │
  ├─ YES: parse colon-separated list → filter empty strings → roots[]
  │        (KORRI_CONFIG_ROOTS="" with nothing after filtering → roots = [])
  │
  └─ NO: XDG fallback (korriDataPath or korriConfigPath?) → roots = [xdgFallback]
          (no HOME / XDG_DATA_HOME → ???)
           │
           └─ UNRESOLVED: does missing HOME produce empty-baseline or hard error?
                          (currently: LibraryError; spec: empty is valid)

roots[] → openDocumentGraph({ roots, optional: true, include: [...] })
         → merge YAML fragments → validate schema
         │
         ├─ valid  → active snapshot; start per-present-root watchers
         │           emit SSE: config.ready { roots: [...] }
         │
         └─ invalid → ??? startup-failed state not specified
                       (no last-known-good exists yet)
```

**Terminal states:** `active(snapshot)`, `startup-failed(error)` (state undefined by spec)

---

### Flow 2 — Config file change at runtime

```
watcher fires (any root) → debounce
                         → documentGraph reactive reload
                         → validate new merged graph
                         │
                         ├─ valid  → update active snapshot
                         │           emit SSE: ??? (config.ready again? config.changed?)
                         │
                         └─ invalid → retain last-known-good
                                      emit SSE: config.error { ??? }
```

**Decision point unspecified:** does a successful reload emit `config.ready` again, or a
distinct `config.changed`? Both names appear in the research doc; the React bridge must
listen to one of them to trigger the library refresh — but which one?

---

### Flow 3 — React bridge SSE subscription

```
HomeRuntimeLayersRoot mounts
  → new EventSource("/api/config/events")
  → receives config.ready { roots: [] }      ← current bridge ignores this
  → user edits YAML file                      ← what event fires? (see Flow 2 gap)
  → bridge receives ??? event
  → calls refreshLibraryItems()
  → libraryItemsAtom re-fetches via RPC
```

**Reconnect path:**

```
EventSource disconnects (network blip, korrid restart)
  → auto-reconnects
  → korrid emits config.ready { roots: [...] }
  → bridge receives config.ready
  → ??? (current bridge has no listener for config.ready)
  → UI stays stale until next config file write
```

---

### Flow 4 — Desktop API forwarder (Electrobun)

```
Portal renders → EventSource("/api/config/events") → Electrobun intercepts /api/* 
  → api-forwarder: buildUpstreamUrl preserves pathname verbatim
  → upstream: korrid /api/config/events
  → isEventStream() check: content-type: text/event-stream → streaming passthrough
  → events flow through without buffering                  ← forwarder is path-agnostic;
                                                             this already works
```

The forwarder body (`api-forwarder.ts`) needs **no code changes** — it forwards all
`/api/*` paths generically and detects SSE via `content-type`. However, the test fixture
at `api-forwarder.test.ts:114` hardcodes `"/api/library/events"` and must be updated to
`"/api/config/events"` along with the event name `"library.ready"` → `"config.ready"`.

---

### Flow 5 — Multi-root watcher management

```
roots at startup: ["/nix/store/abc-platform-defaults", "/var/lib/korri/library"]
  → root-0 exists → watcher-0 started
  → root-1 exists → watcher-1 started
  → root-1 absent → not watched (ProseQL behavior: optional roots absent at startup
                                  never get a watcher started later)

Later: root-1 directory created externally
  → NO watch event ever fires for this root
  → config fragments written to root-1 are SILENTLY IGNORED until next restart
```

---

### Flow 6 — Nix deployment (SM8550)

```
korri-daemon.nix evaluates:
  library.roots = [<nix-store-platform-defaults-dir>, "${stateRoot}/library"]
  KORRI_CONFIG_ROOTS = "<store-path>:${stateRoot}/library"

ExecStartPre:
  current: install 00-korri-platform-defaults.yaml INTO ${library.root}
  new:     platform defaults ARE the store path; no install step needed
           BUT: ExecStartPre for user library dir creation still needed

systemd.tmpfiles.rules:
  "d ${stateRoot}/library 0700 ${user} ${group}"  ← needs to be per-root in new model

ReadWritePaths:
  current: [library.root, launchArtifactsDir]
  new:     documentGraph is read-only — no write access to config roots needed
           sidecar JSONs (where do they live?) still need write access
```

---

### Flow 7 — Import tools and write paths

```
rocknix importer / artifact-import-command:
  reads KORRI_LIBRARY_ROOT → opens openKorriLibraryDb({ root })
  → makeKorriLibraryDbConfig (today: documents source, outbox: writable)
  → repository.upsertGame() → db.systems.upsert() → ProseQL write

After migration:
  makeKorriLibraryDbConfig → documentGraph (READ-ONLY)
  → repository.upsertGame() → CollectionApi.create() → DocumentGraphSourceError
  → HARD RUNTIME FAILURE

Write-target is parked, but the code path hits this immediately on first
import attempt. The spec needs an explicit guard or a clear statement that
import tools continue using the legacy openKorriLibraryDb shape (documents
source) pointed at a designated writable root, while the runtime read path
uses the documentGraph shape. These cannot be the same db config.
```

---

## Gaps

### Critical

#### C1 — KORRID startup failure is unspecified (no last-known-good on first boot)

**What's missing:** The last-known-good lifecycle is defined for the steady state
(`active` → `reload failed` → `retain last-known-good`), but not for startup. When korrid
starts and the initial documentGraph validation fails, there is no prior snapshot to fall
back to. The spec does not say whether korrid should:

- (a) fail to start (systemd Restart kicks in),
- (b) serve an empty config graph and emit `config.error`, or
- (c) loop retrying validation until a valid config exists.

**Why it matters:** Option (a) causes `config.ready` to never be emitted on a first-time
deploy where the user hasn't yet written any YAML — but the spec says "empty baseline is
valid", which implies option (b) for zero roots. Yet a non-empty but schema-invalid root is
different from zero roots. The state machine has at least three distinct startup outcomes,
and the SSE event(s) emitted for each differ. The React bridge and any monitoring tooling
depend on this contract.

**Existing codebase note:** Today `withLibraryRepository` in `library-source-layer-live.ts`
uses `Effect.scoped` per RPC call and simply fails the call with `LibraryError`. There is no
idle-state snapshot concept; this entire pattern is new.

**Default assumption:** Empty roots (zero files found) → `config.ready { roots: [] }`.
Schema-invalid files at startup → `config.error { ... }` + korrid serves empty frozen
snapshot (not a crash restart). This matches "empty baseline valid" while still surfacing
errors to the client.

---

#### C2 — `config.ready` vs. `config.changed` event ambiguity after reload

**What's missing:** The research doc lists two different behaviors for a successful
config reload:

> "if new graph validates → updates active snapshot; emits `config.ready` again"

But the React bridge is documented to listen for `config.changed` to trigger a library
refresh:

> "listens for `config.changed`"

If reload fires `config.ready` (not `config.changed`), the React bridge never refreshes
after a runtime config update. If reload fires `config.changed`, the initial mount
readiness signal (`config.ready`) and the reload signal are different events requiring
separate listeners. The spec does not resolve which event fires on which occasion.

**Why it matters:** The `LibraryChangeRefreshBridge` in `HomeRuntimeLayersRoot.tsx`
currently only listens to one event name (`library.changed`). Replacing it with the wrong
event name means config changes are silent in the UI. Reconnect after a disconnect is the
most likely path to observing stale UI in production.

**Default assumption:** Emit `config.ready { roots }` on startup (and after reconnect
readiness is re-established), `config.changed { root, path }` on each file-level change
(whether or not a reload triggers a snapshot update). React bridge listens to **both**:
`config.ready` triggers a refresh (handles reconnect), `config.changed` triggers a refresh
(handles live edits).

---

#### C3 — `documentGraph` read-only breaks write paths that must stay writable

**What's missing:** `makeKorriLibraryDbConfig` today creates a `documents` source with
`outbox: "library.yaml"` — a writable store. Changing it to `documentGraph` (read-only)
immediately breaks:

1. `tools/importers/rocknix/cli.ts` → `rocknix-importer.ts` → `repository.upsertGame()`,
   `repository.upsertStorage()`, etc. — all ProseQL write paths.
2. `tools/library/launcher-config-cli.ts` — writes launchers, games via the repository.
3. `withTempProseqlLibrary` in `tools/testing/library/` — uses `db.apps.upsert()`,
   `db.users.upsert()`, `db.systems.upsert()`, etc. to seed test fixtures; these all
   become `LegacyCollectionRemovedError`-equivalent failures on a read-only source.
4. `product/apps/cli/artifacts/artifact-import-command.ts` — writes to the sidecar JSON
   files that are co-located with the library root.

**Why it matters:** If `openKorriLibraryDb` switches to `documentGraph`, **every test that
seeds data via the db API breaks immediately**, not just import tools. The test helper
`withTempProseqlLibrary` is used by 10+ test files. The migration plan treats this as
covered by the parked "write-target semantics" item, but the seeding strategy for tests
is an implementation blocker for the migration itself, not a follow-up concern.

**Required clarification:** Two separate db-config factory functions are needed:
- `makeKorriConfigDbConfig(roots)` → `documentGraph` (read-only, multi-root, for runtime)
- `makeKorriWritableDbConfig(root)` → `documents` (single root, writable, for CLI tools and tests)

Or: the write seam is resolved by keeping the existing `documents`-backed db open for
the designated writable root alongside the `documentGraph` read path.

---

#### C4 — `host:` singleton transform risks double-application with `documentGraph`

**What's missing:** `korriReadableYamlCodec.decode` calls `wrapPlainHostForProseql()`,
converting `host: { ... }` → `host: { local: { ... } }`. In the current `documents`
source this happens per-file during decode and is correct.

The research doc also mentions a `korriReadableDocumentTransform` function to pass as the
`transform` field in `DocumentGraphSourceConfig`. If this transform also calls
`wrapPlainHostForProseql`, AND the codec is also registered via
`makeNodePersistenceLayer(config, { codecs: [korriReadableYamlCodec] })`, then both the
codec decode AND the document transform will apply the host-wrap to the same document,
producing `host: { local: { local: { ... } } }` — double-wrapped.

**Why it matters:** The `InvalidSingletonHostError` check will fire unexpectedly once
deep-merge produces a `host` section with a `local` key pointing to another object with a
`local` key. This is a silent correctness bug that will only surface when a YAML file
contains a `host:` block.

**Required clarification:** Decide exactly one application point for the host-singleton
wrap: either the codec's `decode` function OR the `documentGraph` `transform` field, not
both. The codec-based approach (already working today) is the lower-risk choice.

---

### Important

#### I1 — `KORRI_CONFIG_ROOTS=""` (empty string set) vs. unset must be distinguishable

**What's missing:** The spec says:

> "An empty `KORRI_CONFIG_ROOTS` with no XDG fallback → valid empty baseline (no error)"

This implies that setting `KORRI_CONFIG_ROOTS=""` explicitly suppresses the XDG fallback.
But `process.env.KORRI_CONFIG_ROOTS` is `undefined` when unset and `""` when set to empty
— these must route differently:

```ts
KORRI_CONFIG_ROOTS=undefined  → apply XDG fallback
KORRI_CONFIG_ROOTS=""         → valid empty baseline, no fallback
KORRI_CONFIG_ROOTS=":::"      → empty-after-filter → same as "" semantics?
```

The current `parseListEnv` helper (from `library-source-layer-live.ts`) returns
`undefined` for both unset and empty-after-filter, which collapses these cases. A new
`parseConfigRootsEnv` must handle the `undefined` vs. `""` distinction explicitly.

**Why it matters:** A misconfigured deployment that accidentally clears `KORRI_CONFIG_ROOTS`
should get the XDG fallback (library still visible), not silently become an empty baseline.
Conversely, an operator who explicitly sets it to `""` to suppress all roots should get
an empty baseline, not an XDG path they didn't ask for.

---

#### I2 — Persistent db scope: what Effect pattern replaces `Effect.scoped` per call?

**What's missing:** The plan says korrid should open the documentGraph db once at server
startup and hold it for the server lifetime ("Move `openKorriLibraryDb` out of
`withLibraryRepository`… into the korrid startup path"). But the spec doesn't say what
Effect construct manages this:

- `Layer.scoped(ConfigGraphService, openDocumentGraphDb(...))` — scope tied to the
  Layer's lifetime; finalizers run when the Layer is released
- Explicit `Scope.make()` held in a `Ref`, released on SIGTERM/SIGINT
- `Effect.acquireRelease` in a top-level daemon fiber

Without specifying the pattern, different implementors will choose different approaches,
each with different finalizer-on-restart semantics. The ProseQL reactive watch is attached
to the persistent db handle — if the scope is released prematurely, watchers die silently.

**Why it matters:** The `Effect.scoped` per-call model (current) means every RPC call opens
and closes the db. The new model requires the db to outlive individual requests. If the
scope strategy is wrong, hot-reload loses its watcher after the first request closes the
scope.

**Default assumption:** `Layer.scoped(ConfigGraphService, openDocumentGraphDb(...))` where
`ConfigGraphService` exposes both `getSnapshot()` and `onReload(callback)`. The Layer is
provided at server startup and released when the server process exits.

---

#### I3 — Multi-root watcher failure isolation is unspecified

**What's missing:** Currently, if the single-root watcher errors, `startController.error(error)`
is called and the SSE stream terminates. With multiple roots, a single watcher error should
ideally:

- Log the error,
- Stop watching the failing root,
- Continue serving other roots' events,
- Emit a `config.error { root, error }` event rather than terminating the whole stream.

The spec doesn't say whether a multi-root watcher error is fatal to the stream or partial.
If it's fatal, a flaky network filesystem for one root kills all config refresh for the
whole portal, even for users whose config is in a healthy root.

---

#### I4 — Platform defaults root should not be `optional: true`

**What's missing:** The research doc proposes `optional: true` for ALL roots in the
`documentGraph` config (to make "empty baseline valid"). But the platform defaults root is
a Nix store path — it always exists by construction. If it is marked `optional: true` and
the path is accidentally wrong (mistyped Nix expression), korrid silently ignores it and
users see factory-reset behavior with no error.

**Why it matters:** A missing platform defaults root indicates a deployment bug. It should
be a hard `DocumentGraphSourceError`, not a silent skip. User config roots are the ones that
should be optional (first-boot, SD card not inserted, etc.).

**Recommendation:** `optional: false` for the Nix-store platform defaults root,
`optional: true` for all user-provided roots in `KORRI_CONFIG_ROOTS`.

This requires the `makeKorriLibraryDbConfig(roots)` factory to accept per-root metadata,
not just a flat `string[]`:

```ts
type ConfigRootSpec = { root: string; optional: boolean }
makeKorriConfigDbConfig(roots: readonly ConfigRootSpec[]): ...
```

---

#### I5 — `KORRI_LIBRARY_ROOT` hard-cut breaks three independent call sites simultaneously

**What's missing:** The spec says "no legacy support for `/api/library/events`." By
analogy, the env var rename also appears to be a hard cut. But `KORRI_LIBRARY_ROOT` is
read in at least five independent places with no shared helper:

| File | Usage |
|------|-------|
| `library-source-layer-live.ts` | `buildLibraryRootFromEnv()` |
| `portal/api/library/events.ts` | `resolveLibraryRoot()` |
| `portal/api/http/game-asset-bytes.ts` | direct `env.KORRI_LIBRARY_ROOT` |
| `platform/library/game-assets/game-assets-service.ts` | direct `env.KORRI_LIBRARY_ROOT` |
| `apps/desktop/nix/wrap.nix` | `export KORRI_LIBRARY_ROOT=...` |
| `services/device/sessiond-electrobun.ts` | propagated to session env |
| NixOS modules (korri-daemon.nix, korri-sessiond.nix) | emitted as `serverEnv` |

A hard cut without a transitional period means all existing `.envrc` files, NixOS configs,
and deployed kiosk images break on first update. The research doc explicitly recommends
keeping `KORRI_LIBRARY_ROOT` as a fallback for one transition cycle, but the spec doesn't
require it.

**Why it matters:** The Bandai/SM8550 image is a deployed device. A hard cut requires
coordinating the NixOS module update, the TypeScript server update, and the image rebuild
in a single atomic deployment. Any partial deploy leaves the device unreachable.

**Default assumption:** During this migration slice, `buildConfigRootsFromEnv()` checks
`KORRI_CONFIG_ROOTS` first, then falls back to `KORRI_LIBRARY_ROOT` (treated as a
single-element list), with a deprecation log. Hard removal of `KORRI_LIBRARY_ROOT`
support is a follow-up commit after the image is updated.

---

#### I6 — XDG fallback: DATA vs. CONFIG path is unresolved

**What's missing:** The research doc offers two conflicting options for the XDG fallback:

> "Fallback: `korriConfigPath(env, "library")` (i.e. `~/.config/korri/library`) when both
> `KORRI_CONFIG_ROOTS` and an explicit root env are absent. (Or retain `korriDataPath`
> fallback; align with whatever XDG base matches the chosen store semantics.)"

`korriDataPath(env, "library")` → `$XDG_DATA_HOME/korri/library` (existing behavior)  
`korriConfigPath(env, "library")` → `$XDG_CONFIG_HOME/korri/library` (new proposal)

These resolve to **different directories** on a typical system. If the fallback switches
from DATA to CONFIG, existing users' libraries at `~/.local/share/korri/library` become
invisible on upgrade until they move the directory.

**Why it matters:** Unintended data migration on upgrade. This must be decided before
implementation to avoid baking the wrong path into test fixtures, Nix module defaults, and
docs.

---

#### I7 — `withTempProseqlLibrary` seeding strategy breaks under `documentGraph`

**What's missing:** The test helper seeds data via `openKorriLibraryDb` → `db.users.upsert()`,
`db.apps.upsert()`, `db.systems.upsert()`, etc. These are ProseQL write operations. If
`openKorriLibraryDb` switches to a `documentGraph` source (read-only), all 10+ tests using
this helper fail immediately with `LegacyCollectionRemovedError` or the documentGraph
equivalent.

**Required action (not optional):** A new `withTempConfigGraph` helper must write YAML
files directly to temp directories (bypassing the db API for seeding), then open the db
in read-only mode. The seeding API becomes:

```ts
// New seeding strategy: write YAML files, not ProseQL upserts
async function withTempConfigGraph(roots: TempRootSpec[]): Promise<TempConfigGraph>

type TempRootSpec = {
  yaml: string          // raw YAML content to write
  filename?: string     // default: "library.yaml"
}
```

This is a hard prerequisite for any test coverage of the multi-root behavior.

---

#### I8 — Debounce semantics across multiple roots are unspecified

**What's missing:** The current SSE handler uses a single `debounce` timeout reset on any
YAML file change. With multiple roots and separate watchers, the spec doesn't say whether:

- Each root has its own independent debounce, or
- All roots share a single debounce window (coalescing simultaneous multi-root writes).

A Nix deployment that atomically updates both the platform defaults root and the user root
(e.g., via `nixos-rebuild switch`) will fire watchers on both roots nearly simultaneously.
Independent debounces → two `config.changed` events; shared debounce → one. The React
bridge triggers a library refresh on each event, so two events means two redundant
re-fetches from the client.

**Default assumption:** A single shared debounce across all roots. This matches the current
behavior (one debounce for all files within the one root) and avoids redundant refreshes.

---

### Minor

#### M1 — `KORRI_LIBRARY_EVENTS_DEBOUNCE_MS` name leaks library terminology into config model

The debounce env var name would either need renaming to `KORRI_CONFIG_EVENTS_DEBOUNCE_MS`
or the old name must be documented as a deliberate alias. Neither the research doc nor the
spec addresses this. Silently keeping the old name is fine for a transition period but
should be called out as a known carryover, not an oversight.

---

#### M2 — `config.changed` payload exposes absolute server paths to SSE clients

The proposed shape `config.changed { root, path }` includes the absolute filesystem path
of a config root as `root`. The current `library.changed` only includes the relative `path`
within the root. Absolute paths expose server directory layout to any SSE subscriber
(including remote federation peers). The React bridge never uses the `root` field — it
only calls `refreshLibraryItems()` unconditionally. If the payload is advisory only, using
basenames or root indices (`{ rootIndex: 0, path: "library.yaml" }`) is less leaky.

---

#### M3 — `korri-sessiond-module-check.nix` hardcodes `daemon.library.root` stub

`tools/testing/nix/korri-sessiond-module-check.nix:22` declares a stub option
`daemon.library.root` to satisfy the sessiond module's dependency on the daemon module
shape. After the migration adds `daemon.library.roots`, this stub will need an analogous
entry or the eval check will fail at the NixOS option type boundary.

---

#### M4 — Desktop wrapper silently produces empty library if `KORRI_CONFIG_ROOTS` is unset

`product/apps/desktop/nix/wrap.nix` currently sets `KORRI_LIBRARY_ROOT` explicitly. After
migration, if the wrapper is not updated to set `KORRI_CONFIG_ROOTS`, and if the
`KORRI_LIBRARY_ROOT` fallback is removed, the desktop app starts with zero config roots
(empty baseline is valid per spec) and shows an empty library with no error. This is
indistinguishable from "library not seeded yet" and will be confusing for desktop users who
already have YAML files at the old path.

---

## Questions

**Q1 — What happens when korrid's initial config graph fails validation on startup?**

Stakes: Undefined behavior — some implementors will crash-loop (causing systemd restarts
to hide the error from the UI), others will serve empty config (causing the portal to show
an empty library with no diagnostic). The SSE contract for the client differs in each case.

Default assumption: Serve empty snapshot; emit `config.error { message, files? }` on SSE;
do not crash. Log the error. Accept the empty baseline as the last-known-good until a
valid config is written.

---

**Q2 — Does a successful config reload emit `config.ready` (again) or `config.changed`?**

Stakes: The React bridge must listen to the correct event name, or config changes are
invisible in the UI after the initial mount. The reconnect case (SSE disconnect/reconnect)
also depends on this: `config.ready` on reconnect must trigger a library refresh or the
UI is stale until the next file write.

Default assumption: `config.ready { roots }` fires on startup AND after every successful
reload. `config.changed { rootIndex, path }` fires per file change event (whether or not
the reload produces a valid new snapshot). React bridge listens to both: `config.ready` →
refresh, `config.changed` → refresh. Stale-after-reconnect is handled by `config.ready`.

---

**Q3 — What write-db strategy do import tools and tests use during this migration?**

Stakes: If `openKorriLibraryDb` changes to `documentGraph`, every seeding call in
`withTempProseqlLibrary` and every import tool call breaks. This is not a deferred
concern — it blocks the migration's own test coverage.

Default assumption: Keep a separate `openKorriWritableDb({ root })` function using the
existing `documents` source for write-path callers (importers, test helpers). The runtime
read path uses the new `openKorriConfigGraph({ roots })` function with `documentGraph`.
Both coexist until the write-target parked item lands.

---

**Q4 — Should `KORRI_CONFIG_ROOTS=""` (explicitly set to empty) suppress the XDG fallback?**

Stakes: Whether a user who clears the variable accidentally loses their library (empty
baseline) or gets a safe XDG fallback (library still visible). The two behaviors are
only distinguishable by checking for `undefined` vs. `""` — easy to get wrong.

Default assumption: `KORRI_CONFIG_ROOTS` set to any value (including empty string) →
use parsed roots (possibly empty). `KORRI_CONFIG_ROOTS` absent (`undefined`) → apply XDG
fallback. Document this distinction explicitly in the new `parseConfigRootsEnv` helper.

---

**Q5 — Which XDG base does the single-root fallback use: DATA or CONFIG?**

Stakes: Changing from `$XDG_DATA_HOME/korri/library` to `$XDG_CONFIG_HOME/korri/library`
breaks existing desktop users who have YAML files at the old path. This must be decided
before implementation to avoid accidental silent data loss on upgrade.

Default assumption: Retain `korriDataPath(env, "library")` to preserve backwards
compatibility. Document that future XDG alignment (if desired) is a separate migration with
an explicit directory move step.

---

**Q6 — Is the platform defaults root `optional: false` or `optional: true`?**

Stakes: `optional: true` silently ignores a misconfigured Nix store path (deployment bug
looks like a factory reset). `optional: false` produces a hard error when the platform
defaults root is missing, which is the correct signal for a deployment bug.

Default assumption: `optional: false` for Nix-store roots (platform defaults). Accept this
as a configuration contract: if the platform path doesn't exist, korrid won't start until
the image is fixed.

---

**Q7 — Should `KORRI_LIBRARY_ROOT` remain a fallback during this migration, or hard-cut?**

Stakes: A hard cut requires atomic coordination across the NixOS image, korrid binary, and
the desktop wrapper. Any partial deploy (binary updated, image not yet rebuilt) leaves
deployed Bandai kiosks with no config visible, no errors in familiar log locations, and no
user-visible diagnostic.

Default assumption: `KORRI_LIBRARY_ROOT` is accepted as a single-entry fallback (with a
logged deprecation warning) when `KORRI_CONFIG_ROOTS` is absent. Hard removal is a
follow-up after the image is verified.

---

**Q8 — What Effect construct manages the persistent ProseQL db scope?**

Stakes: Wrong scope strategy either leaks the db handle (never released on shutdown) or
releases it prematurely (watchers die after first RPC call, silent no-op config watch).

Default assumption: `Layer.scoped(ConfigGraphService, makeConfigGraphEffect)` where
`makeConfigGraphEffect` opens the db with `Effect.acquireRelease` — the ProseQL handle
lives as long as the Layer, and the Layer is provided once at server startup.

---

**Q9 — Does a single watcher error terminate the entire SSE stream or only that root?**

Stakes: A flaky NFS mount, temporarily missing SD card root, or permission error on one
root should not kill the whole portal's live-update path. But the current
`startController.error(error)` pattern terminates the stream.

Default assumption: Per-root watcher errors emit `config.error { root, error }` on SSE
and stop watching that root, but the stream remains open for other roots. Re-watch on next
server restart (or an explicit reconnect from the client).

---

**Q10 — What `ReadWritePaths` does the korrid systemd service need in the new model?**

Stakes: `documentGraph` is read-only; the current `ReadWritePaths = [library.root, ...]`
was needed for the `documents` outbox. If the write path is fully deferred, the service
hardening can tighten (fewer writable paths = better security posture). But JSON sidecar
files (`.korri-artifacts.json`, etc.) may still need a writable home.

Default assumption: Remove `ReadWritePaths` for config roots. Add `ReadWritePaths` for
wherever JSON sidecars are relocated (likely `launchArtifactsDir` or a dedicated sidecar
dir). Verify in `korri-daemon-module-check.nix`.

---

## Recommended Next Steps

### Before any implementation begins

1. **Answer Q2 and Q3 together.** The event name contract (`config.ready` / `config.changed`)
   and the write-db strategy (`openKorriConfigGraph` vs. `openKorriWritableDb`) are the
   two decisions that block all other implementation. Both can be decided in a short
   document or ADR without touching any code.

2. **Decide Q5 (XDG base) immediately.** This is a one-line choice that affects the Nix
   module default, the desktop wrapper, and every test that exercises the XDG fallback path.
   A wrong choice here is a silent data loss bug on upgrade.

### Before the ProseQL db config change (`library-db.ts`)

3. **Add a new `makeKorriConfigDbConfig(roots)` factory** alongside (not replacing)
   `makeKorriLibraryDbConfig`. Keep the old function for write-path callers (import tools,
   `withTempProseqlLibrary`). This eliminates the C3 blocker without touching write tools.
   Verify with `just typecheck` + `just test-unit` before merging.

4. **Define the `host:` transform application point** (C4). Update `korriReadableYamlCodec`
   or add a `documentGraph`-specific transform, but not both. Add a unit test: a YAML file
   with `host: { moonlight: {...} }` round-trips through the codec exactly once.

### Before the SSE handler replacement (`/api/config/events`)

5. **Write the state machine for KORRID last-known-good** as a TypeScript discriminated
   union before implementing it. Include all transitions: `Initializing`, `Active`,
   `Reloading`, `StartupFailed`, `ActiveWithError`. Each state has a corresponding SSE
   event shape. Test the ADT and its transitions in isolation before wiring to the db and
   HTTP.

6. **Create `withTempConfigGraph`** in `tools/testing/library/` using direct YAML writes
   (not ProseQL upserts). Port at least `library-db.test.ts` to confirm the multi-root
   merge behavior before the runtime path depends on it.

### Before the NixOS module changes

7. **Add `library.roots` as a `listOf str` option alongside `library.root`** (deprecate,
   not remove). Emit `KORRI_CONFIG_ROOTS` from the roots list. Keep `KORRI_LIBRARY_ROOT`
   as a backwards-compatible emission from `lib.elemAt cfg.library.roots 0` until the
   transition is complete. Validate with `korri-daemon-module-check.nix`.

8. **Move platform defaults to a dedicated first root** (a Nix store path directory, not
   an installed file). Mark it `optional: false` in the config, `optional: true` for all
   user roots. Update `korri-daemon-module-check.nix` and `korri-image-outputs-check.nix`
   to assert the new root structure.

### Before merging

9. **Update `api-forwarder.test.ts`** to replace `/api/library/events` with
   `/api/config/events` and `"library.ready"` with `"config.ready"`. This is the only
   forwarder change needed (C4 is in the forwarder test, not the forwarder code).

10. **Update `HomeRuntimeLayersRoot.test.tsx`** to assert the new `EventSource` URL
    (`/api/config/events`), new event names, and the reconnect-refresh behavior. The
    `FakeEventSource` harness already supports arbitrary event names; update the assertions.

11. **Run the Nix-level SM8550 image eval checks** (`just sm8550-kiosk-toplevel-check`) and
    the updated `korri-daemon-module-check.nix` before merging the NixOS module changes.
    Add assertions for `KORRI_CONFIG_ROOTS` in the env and for the `ReadWritePaths`
    reduction. Per the architectural-posture learning, put SM8550-specific root defaults
    in `nix/images/headless.nix`, not in the module default.
