---
title: ProseQL library YAML should use canonical storage with key-derived IDs
date: 2026-05-06
category: docs/solutions/best-practices
module: korri/shared/library/proseql + tools/importers/rocknix
problem_type: best_practice
component: database
severity: medium
applies_when:
  - Persisting Korri-owned library data in ProseQL plain-text files
  - Importing unstable external library snapshots such as ROCKNIX gamelists
  - Keeping runtime LibrarySource/RPC/UI contracts stable while changing storage
  - Reviewing human-editable YAML produced by object-keyed ProseQL collections
tags: [proseql, library, yaml, derived-ids, rocknix, odin, importer, persistence]
---

# ProseQL library YAML should use canonical storage with key-derived IDs

## Context

Korri's personal MVP initially read the live library directly from ROCKNIX `gamelist.xml` and `es_systems.cfg` files. That was useful for proving the end-to-end Odin flow, but it left ROCKNIX metadata at risk of becoming the product database by inertia.

The replacement is a Korri-owned ProseQL library root. ROCKNIX is now a snapshot importer only: parse the external files once, write Korri-owned ProseQL collections, and let runtime code read ProseQL through the existing `LibrarySource`, RPC, UI, and launcher seams.

A second friction appeared once ProseQL was writing YAML. Object-keyed collections naturally key each record by id, but persisting the runtime `GameRecord` shape duplicated the same id inside the payload:

```yaml
472c8ba3-c51c-45ed-8bab-fc560edd83ea:
  id: 472c8ba3-c51c-45ed-8bab-fc560edd83ea
  metadata:
    name: Default
```

For human-reviewed plain-text data, that duplication is noise. After ProseQL added key-derived IDs in `@proseql/node@0.12.0`, Korri switched the persisted schema to payload-only records and hydrates `id` from the YAML key at runtime.

## Guidance

Treat ProseQL as the canonical runtime library store, and keep external systems out of the live read path:

```text
ROCKNIX files -> importer -> ProseQL YAML -> LibrarySource -> RPC/UI/Launcher
```

Do not make ROCKNIX a selectable runtime database. Its paths and state can change outside Korri, so reconciliation via persistent import links creates more product surface than the MVP needs. For ROCKNIX snapshots, import into an empty Korri library and make replacement an explicit reset/re-import operation.

For object-keyed ProseQL YAML, use key-derived IDs and separate persistence payload schemas from runtime contracts:

```ts
export const GamePayloadRecord = Schema.Struct({
  metadata: Schema.optional(GameMetadata),
  userData: Schema.optional(GameUserData),
})

export const LaunchTargetPayloadRecord = Schema.Struct({
  gameId: Schema.String,
  spec: LaunchSpec,
})

export function makeKorriLibraryDbConfig(root: string) {
  return {
    games: {
      schema: GamePayloadRecord,
      id: { kind: "derivedFromKey", field: "id" },
      file: join(root, "games.yaml"),
      relationships: {},
    },
    launchTargets: {
      schema: LaunchTargetPayloadRecord,
      id: { kind: "derivedFromKey", field: "id" },
      file: join(root, "launch-targets.yaml"),
      relationships: {
        game: { type: "ref", target: "games", foreignKey: "gameId" },
      },
      uniqueFields: ["gameId"],
    },
  } as const
}
```

Keep the repository boundary responsible for decoding hydrated runtime records back into Korri's existing contracts:

```ts
listGames: () =>
  Effect.promise(() => db.games.query().runPromise).pipe(
    Effect.map(records =>
      records
        .map(record => decodeGameRecord(record))
        .sort(compareByLastPlayedDesc),
    ),
  )
```

The resulting YAML is easier to read and diff because the id appears once as the storage key:

```yaml
_version: 1
25afeac6-f68c-4d44-b42e-87ec4c0a436b:
  metadata:
    name: Default
    media:
      - type: image
        uri: /api/media/games/moonlight/Default/poster-600x900.png
  userData:
    lastPlayed: 2026-04-28T16:06:23.000Z
    playtime: 21
```

Launch targets should follow the same rule:

```yaml
_version: 1
launch:25afeac6-f68c-4d44-b42e-87ec4c0a436b:
  gameId: 25afeac6-f68c-4d44-b42e-87ec4c0a436b
  spec:
    command: /bin/sh
    args:
      - /storage/roms/moonlight/Default.sh
```

## Why This Matters

This keeps three ownership boundaries clear:

1. **Korri owns runtime library data.** The app reads `/storage/korri/library`, not ROCKNIX metadata, so future Korri OS or non-ROCKNIX sources do not inherit MVP scaffolding.
2. **ROCKNIX remains deletable.** Import tooling can reuse ROCKNIX parser knowledge without making `gamelist.xml`, `es_systems.cfg`, or source-path reconciliation part of the product contract.
3. **Plain-text persistence stays human-friendly.** YAML is easier to review when object keys are the ids and payloads contain only domain data.

It also preserves existing app seams. The browser still talks through Korri RPC, UI code still consumes `GameRecord`, and launch still asks `LibrarySource.launchSpecFor(id)`. ProseQL stays server-side persistence, not a second renderer data strategy.

## When to Apply

- Apply this when a ProseQL collection is persisted as an object-keyed human-readable file and `id` would otherwise be duplicated inside each record.
- Apply this when the runtime contract needs `id`, but the file format should store payload data only.
- Apply snapshot import semantics for unstable external sources such as ROCKNIX where external paths/state are not a durable identity contract.
- Do not apply snapshot-only semantics to future stable online databases without re-evaluating the model; those may deserve explicit external references or match records.
- Keep ProseQL adapters on the server/runtime side. Renderer code should continue using the established RPC and atom layers.

## Examples

Avoid persisting runtime records directly when the outer key already represents identity:

```yaml
# Avoid: duplicated id in human-reviewed YAML.
game-1:
  id: game-1
  metadata:
    name: F-Zero
```

Prefer a payload schema with key-derived id hydration:

```yaml
# Prefer: id appears once as the object key.
game-1:
  metadata:
    name: F-Zero
```

The database still returns hydrated runtime records:

```ts
const game = yield* db.games.findById("game-1")
// { id: "game-1", metadata: { name: "F-Zero" } }
```

For importer idempotency, avoid persistent ROCKNIX import links unless there is a real reconciliation product requirement. The ROCKNIX importer should fail fast when the target library already has games:

```ts
const existingGames = await Effect.runPromise(config.repository.listGames())
if (existingGames.length > 0) {
  throw new Error(
    "ROCKNIX import requires an empty Korri library; reset the target library before importing a fresh ROCKNIX snapshot",
  )
}
```

Verification used real implementations rather than mocks:

```bash
bun test korri/shared/library/proseql/library-db.test.ts \
  korri/shared/library/proseql/library-repository.test.ts \
  korri/shared/library/proseql/proseql-library-source.test.ts \
  tools/importers/rocknix/rocknix-importer.test.ts

just typecheck
just lint
just test-unit
```

On Thor, the deployment was validated by re-importing ROCKNIX into `/storage/korri/library`, confirming no nested `id:` fields remained in `games.yaml` or `launch-targets.yaml`, restarting the supervised session, and running `just check-odin-sessiond`.

## Related

- `../../../work/01KQX9B50YSG7549NJKEP761MY-feat-proseql-library-foundation/plan.md` — implementation plan for replacing the runtime ROCKNIX library dependency with ProseQL.
- `../../../work/01KQJZR90GHVYQ169G3QWN3G5T-feat-personal-mvp-rocknix-launch/requirements.md` — original seam design: wrap ROCKNIX temporarily and swap to ProseQL when available.
- `docs/solutions/best-practices/temporary-rocknix-sidecar-media-instead-of-es-gamelist-edits-2026-05-03.md` — related ownership rule for keeping temporary ROCKNIX media conventions Korri-owned and deletable.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — reinforces testing ProseQL/importer behavior with real temp files and real RPC handlers.
- `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md` — Odin deploy validation context; device convergence must prove the running session sees the seeded data.
