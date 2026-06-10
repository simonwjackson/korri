# Feasibility Review — feat: Move Korri runtime to a ProseQL config graph

**Plan:** `work/items/active/01KTSH1K3DTG1B6CN4T1CNKHCJ-feat-korri-config-graph/plan.md`  
**Reviewer role:** Systems architect  
**Date:** 2026-06-10

---

## Executive Summary

The architecture direction is sound. ProseQL `documentGraph` is the right substrate for ordered multi-root config assembly, and the event/lifecycle rename is clean. However, three blocking mismatches between the plan's stated design and the actual ProseQL 0.14.0 API must be resolved before implementation starts — the plan's key design rationale ("ProseQL owns watcher reload support") is partially correct but the part that matters for KORRID's `config.invalid` event contract is not surfaced by the API. Two additional implementation gaps need a concrete decision before the relevant units can be coded.

---

## Findings

---

### F1 — ProseQL's built-in reload error handling is opaque to KORRID
**Severity: P1 | Confidence: 100**

**Evidence.** `node_modules/@proseql/core/dist/factories/database-effect.js` lines ~1203–1233 (the `reloadDocumentGraph` function inside `createPersistentEffectDatabase`):

```js
}).pipe(Effect.catch((error) =>
  Effect.logWarning(
    `[proseql] Document graph reload failed for '${sourceId}', keeping last-known-good: ${String(error)}`
  )
));
```

On a failed watcher-triggered reload, ProseQL logs a warning and silently keeps the previous Refs intact. **There is no API surface — no callback, no PubSub event, no returned Effect — through which KORRID can learn that a reload failed.** The `createPersistentEffectDatabase` call returns a database handle; error signals from background watcher reloads do not propagate to the caller.

**Why it matters.** The plan's R6 requires emitting `config.invalid` events when a reload attempt fails. U2 says "emit `config.invalid` after a failed reload while keeping the prior active generation." Both are correct end-state requirements, but they cannot be achieved by opening one `createPersistentEffectDatabase` handle with a `documentGraph` source and relying on ProseQL's built-in watcher — because ProseQL swallows reload failures before KORRID can observe them.

**Actionable resolution.** The implementer must choose one of two architecturally different paths before writing U1/U2:

**Option A (preferred):** Disable ProseQL's built-in documentGraph watcher entirely (do not provide the `documentGraph` source inside `createPersistentEffectDatabase`'s source config). Instead, KORRID uses a separate fs watcher (e.g. Node `fs.watch` / the existing `events.ts` pattern) and calls `loadDocumentGraphSources` directly on change events. On success, KORRID replaces its Ref-backed in-memory state and publishes `config.changed`. On failure, KORRID keeps last-known-good and publishes `config.invalid`. This matches the plan's state machine exactly.

**Option B:** Use `createPersistentEffectDatabase` with a `documentGraph` source for the in-memory storage backing, and add a **parallel** file watcher (separate from ProseQL's) that independently calls `loadDocumentGraphSources` on a change event to classify valid/invalid status. Reload success is inferred from the watcher event; reload failure is detected by catching the standalone `loadDocumentGraphSources` Effect. This is messier because it runs two graph loads on each change event (ProseQL's and KORRID's own).

The plan should specify which path is taken. The U2 "daemon-scoped config graph service" design section should include this decision.

---

### F2 — Initial invalid config fails DB creation; "start with empty baseline" requires an explicit workaround
**Severity: P1 | Confidence: 100**

**Evidence.** `node_modules/@proseql/core/dist/factories/database-effect.js` lines ~875–877:

```js
const loadedDocumentGraph = graphOwnedCollections.size > 0 && normalizedSourceConfig !== undefined
    ? yield* Effect.provide(loadDocumentGraphSources(normalizedSourceConfig), serviceLayer)
    : undefined;
```

`yield*` propagates failure. If `loadDocumentGraphSources` fails (e.g. an invalid fragment in the platform root or local root), `createPersistentEffectDatabase` itself fails — the whole Effect terminates with an error before the database handle is returned.

**Why it matters.** R5 requires: "start with an empty graph on initial invalid config." U2 says: "Treat an initially invalid discovered graph as degraded startup: active empty graph plus invalid diagnostic event/log." This behavior must be explicitly coded by the implementer; ProseQL does not provide it. If the implementer opens a single `createPersistentEffectDatabase` call with documentGraph sources and an invalid fragment exists on first boot, the database creation fails and KORRID cannot start at all, violating R5.

**Actionable resolution.** The implementation of U1/U2 must explicitly handle the startup case:

```
try: createPersistentEffectDatabase with documentGraph sources
catch: create a plain in-memory database (no sources) as empty baseline
        + record the load error for the config.invalid diagnostic
```

This means two different code paths: one where the database is backed by a live documentGraph source (happy path), and one where it's backed by empty Refs (degraded path). The plan should call out this branching explicitly in U2 rather than leaving it as an implementation detail, because it affects the lifecycle service interface.

---

### F3 — `KORRI_LIBRARY_ROOT` is an active write-target consumer not in scope for deferral
**Severity: P1 | Confidence: 100**

**Evidence.** `product/apps/cli/artifacts/artifact-import-command.ts` lines 122–130:

```ts
const libraryRoot = yield* requiredEnv("KORRI_LIBRARY_ROOT")
// ...
KORRI_LIBRARY_ROOT: libraryRoot,
// ...
root: libraryRoot,
```

`requiredEnv` is not optional — it errors if the env is absent. This CLI command uses `KORRI_LIBRARY_ROOT` as a write target (the root for artifact import). It is not a runtime read-path consumer but it reads the same env. The plan explicitly defers write-target semantics (backlog `01KTRYCK5XYMCSVYD55P7XWBDY`) yet simultaneously declares full public contract break with "No legacy public runtime support for `KORRI_LIBRARY_ROOT`."

If `KORRI_LIBRARY_ROOT` is removed from daemon env (Nix module and desktop wrapper) as stated in U4, and the CLI import command still requires it, then:
- Bandai users running `korri artifact import` after the migration will get `KORRI_LIBRARY_ROOT is required` errors
- The CLI has no alternative env to read

**Actionable resolution.** The plan must choose one:

1. **Narrow the "full break" scope:** Remove `KORRI_LIBRARY_ROOT` only from the runtime read path (daemon startup, RPC service, library-source-layer-live). Keep it in scope for write tools as a write-target pointer until the write-target semantics slice is done. The new read env is `KORRI_CONFIG_ROOTS`; the old write env `KORRI_LIBRARY_ROOT` keeps working for importers.

2. **Bring the CLI import update into this slice:** Update `artifact-import-command.ts` to use a write-target env that makes sense for the deferred authoring model. This contradicts the explicit deferral.

3. **Explicitly scope the break:** Document in the plan that `KORRI_LIBRARY_ROOT` is removed from the read path but will remain set in the Nix environment (pointing at `/var/lib/korri/config` or a nominated write target) until the authoring write-target slice is complete.

Option 1 or 3 keeps the deferral intact and is the lower-risk path.

---

### F4 — Optional startup-absent roots are never watched; `/var/lib/korri/config` must exist before KORRID starts
**Severity: P2 | Confidence: 100**

**Evidence.** `node_modules/@proseql/core/dist/factories/database-effect.js` lines ~1252–1266 (comment and loop):

```js
// documentGraph sources: watch each startup-present root. Roots absent at
// startup are not watched (no late detection).
for (const source of normalizedSourceConfig?.sources ?? []) {
    if (source.kind !== "documentGraph") continue;
    for (const root of source.roots) {
        const rootPresent = yield* storageAdapter.exists(root.root)
            .pipe(Effect.catch(() => Effect.succeed(false)));
        if (!rootPresent) continue;
        yield* createDocumentSourceWatcher({ root: root.root, ... })
    }
}
```

The watcher loop skips absent roots. The plan marks `/var/lib/korri/config` (R8 durable local editable config root) as optional — empty baseline is valid. If a first deployment starts KORRID before the directory exists, no watcher is ever registered for it. Config files added later would not trigger reload events.

**Why it matters.** The current `korri-daemon.nix` creates the library root via `tmpfiles.d` (`"d ${cfg.library.root} 0700 ${cfg.user} ${daemonGroup} -"`). If U4 switches to a new config root without similarly ensuring the directory exists before KORRID starts, the watcher silently does not attach and `config.changed` events will never fire for local config edits on a fresh deployment.

**Actionable resolution.** The Nix module changes in U4 must ensure `/var/lib/korri/config` is created before the daemon unit starts — either via `tmpfiles.d` (preferred for system-mode) or an `ExecStartPre` mkdir. The plan already handles this for the platform-defaults root (it's a Nix store path that always exists), but it must also call this out explicitly for the durable local root.

---

### F5 — `korriReadableYamlCodec` double-wrap risk is real; resolution path must be chosen before U1
**Severity: P2 | Confidence: 100**

**Evidence.** `product/platform/library/proseql/library-db.ts` — `korriReadableYamlCodec.decode` applies `wrapPlainHostForProseql` (line ~93). This codec is registered in the persistence layer via `makeNodePersistenceLayer(..., { codecs: [korriReadableYamlCodec] })`. `loadDocumentGraphSources` uses the same `SerializerRegistry` (the service yielded from the Effect environment) to deserialize fragments. So YAML fragments decoded through `documentGraph` will have `host` wrapped by the codec *before* any `documentGraph.transform` runs.

The plan notes this risk ("Avoid combining codec-level wrapping and documentGraph transform wrapping in a way that double-wraps `host`") but defers the resolution to implementation.

**Why it matters.** The implementer cannot write the `documentGraph` source config without knowing whether to:
- Keep host-wrapping in `korriReadableYamlCodec.decode` (no transform needed; non-YAML files won't have host wrapped correctly but that's acceptable if non-YAML files don't have a `host` section)
- Move host-wrapping out of `korriReadableYamlCodec.decode` into a `documentGraph.transform` (means existing `documents` source usage also changes behavior for any path that uses the same codec, e.g. tests that use `openKorriLibraryDb`)

This decision also affects whether the existing `openKorriLibraryDb` function (used for sidecar artifact imports and other write tools) continues to work without modification.

**Actionable resolution.** The simplest resolution that avoids breakage to existing `documents`-source code paths: keep `korriReadableYamlCodec.decode` as-is (host-wrapping happens in the codec for all YAML). In the `documentGraph.transform`, only handle schema validation for non-YAML sections, and explicitly assert that `host` is already in the keyed `{ [LOCAL_HOST_KEY]: host }` shape when present. Do not re-wrap. For non-YAML formats that have a `host` section, add a format-conditional guard in the transform. This should be specified in U1 rather than discovered during coding.

---

### F6 — Include globs require a hardcoded extension list; the choice between enumeration and broad patterns should be pre-decided
**Severity: P2 | Confidence: 75**

**Evidence.** `node_modules/@proseql/core/dist/storage/source-config.js` line ~112: a `documentGraph` source without any include pattern (source-level or root-level) fails normalization: "Document graph source '...' root '...' has no include pattern." The plan's opt-in pattern `**/korri.<ext>` requires enumerating every extension ProseQL supports (`**/*.korri.yaml`, `**/*.korri.yml`, `**/*.korri.json`, `**/*.korri.toml`, ...) OR using a broad pattern like `**/*.korri.*`.

With a broad pattern, ProseQL's own extension check in `loadDocumentGraphSources` will reject any file whose extension is not registered in the `SerializerRegistry` (it fails the whole graph load with an `unsupported-extension` error). This means `**/*.korri.*` plus ProseQL's built-in validation achieves the intent without hardcoded enumeration, **except** that a file like `game.korri.bak` would cause a hard graph load failure rather than being silently skipped.

**Why it matters.** The plan's U5 enumerates 11 specific extensions. If ProseQL adds or removes a codec in a patch version, the hardcoded include list drifts. More importantly, if an operator accidentally creates a file like `local.korri.bak`, ProseQL would fail the entire graph load (unsupported-extension error) rather than skipping it. This drives toward using explicit extension globs in the include patterns rather than `**/*.korri.*`.

**Actionable resolution.** U1 should explicitly specify either: (a) enumerate all supported extensions in the include globs (matching U5's list) and add a test that verifies an unregistered extension like `.bak` is excluded because it never matches the include globs, or (b) use `**/*.korri.*` with a note that unsupported extensions cause a hard graph load error (and test that case). Option (a) is more defensible. The list should be derived from a single constant so U5 tests and U1 config stay in sync.

---

## Sequencing Assessment

The stated unit order (U1 → U2 → U3 → U4 → U5 → U6) is correct. The dependencies are real. However, the resolution of F1 and F2 must happen before any U1 code is written, because they change the fundamental architecture of the config graph service and which ProseQL APIs are called where.

**One additional sequencing note:** U4 (Nix changes) must not be deployed before U1+U2+U3 TypeScript changes are in the same generation. The plan notes this in the risks ("Land TypeScript, Nix env exports, wrapper env, and deployment migration in one verified slice"). This is correct and important — a partial deploy where `KORRI_LIBRARY_ROOT` is removed from Nix env but the TypeScript runtime still reads it would break Bandai immediately.

---

## Non-Blocking Observations

- **HomeRuntimeLayersRoot `config.ready` gap:** The current `LibraryChangeRefreshBridge` only listens to `library.changed`, not `library.ready`. The plan correctly adds `config.ready` for reconnect refresh. No additional concern here; the existing `EventSource` pattern supports multiple `addEventListener` calls.

- **API forwarder:** The desktop forwarder forwards all `/api/*` paths by content-type; renaming the SSE path to `/api/config/events` requires only test fixture updates. The plan correctly identifies this.

- **`game-assets.rpc-handler.test.ts`** uses `KORRI_LIBRARY_ROOT` for test setup only (writable temp path). It will need updating when `library-source-layer-live.ts` stops reading that env, but it's a test change not a production contract.
