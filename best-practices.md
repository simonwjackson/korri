# Multi-User Readiness: Retrofitting Korri's Single-Tenant Domain

> **Scope:** TypeScript + Effect + Nix game-library/streaming/device platform  
> **Goal:** Model the whole system as multi-user (data ownership, sessions, storage scoping, config, RPC contracts carrying an owner/account dimension) without necessarily supporting live user-switching yet.  
> **Date:** 2026-07-14

---

## Executive Summary

Korri already has one foot across the line: `PlayLog` (and `PlayHistoryKey`) in
`product/platform/library/config/records/play-log.ts` already carries `userId` as a
first-class field. The beachhead exists. The work ahead is to (a) promote that
`userId` signal into an **ambient `ActiveProfile` service** in the Effect context
layer, (b) extend the XDG path helpers to scope per-user storage, (c) add `ownerId`
to every domain record that is personal (saves, prefs, history), and (d) make every
RPC handler resolve the profile at the boundary and inject it downward — without
building auth, user management UI, or permission checks yet.

---

## Section 1 — Introducing an Owner/Account Aggregate

### Industry Consensus

The canonical guidance from domain-driven design (Vaughn Vernon; corroborated by the
SE Stack Exchange thread) is that **ownership/tenancy belongs in the domain model,
not only in the infrastructure layer**, because:

- Domain events emitted downstream need the owner to route correctly.
- Repositories that inject owner context silently break if a caller skips the wiring.
- The owner is meaningful business data, not just a storage detail.

**Source:** *"Aggregates and Tenant Ids"* — Software Engineering Stack Exchange  
https://softwareengineering.stackexchange.com/questions/397162/aggregates-and-tenant-ids

The WorkOS guide on multi-tenant SaaS architecture (Dec 2025) reinforces the same
invariant in blunter terms:

> *"Tenancy is a first-class dimension of your domain model: every piece of data
> belongs to exactly one tenant, every request runs with a tenant context, every
> read/write path enforces that context, every authorization decision is evaluated
> within the tenant."*
>
> *"Physical isolation can change later. Logical tenancy can't."*

**Source:** WorkOS — *The Developer's Guide to SaaS Multi-Tenant Architecture*  
https://workos.com/blog/developers-guide-saas-multi-tenant-architecture

### Model-Now Pattern: The Owner Scoping Key

Every record that represents personal data gets a **stable `ownerId` / `userId`
string** as part of its identity — not as a filter that can be forgotten, but as a
named part of the record's primary key (or composite key).

```ts
// ✅ owner is structural, part of the key
export interface PlayHistoryKey {
  readonly userId: string   // ← already present in Korri
  readonly gameId: string
}

// ✅ every personally-owned record carries it
export interface LibraryPrefsKey {
  readonly userId: string
  readonly gameId: string
}
```

The **owner must appear in Schema-backed records** so that:

1. Readers cannot accidentally return cross-user data (the field is always present for a filter).
2. Domain events carry the owner to downstream consumers.
3. Effect Schema validates ownership at wire/decode boundaries — not just at storage.

### Two Valid Shapes for `ownerId` in Effect Services

#### Shape A — Owner as field on every read/write call (explicit)

```ts
class LibraryService extends Context.Service<LibraryService, {
  readonly getPlayLog: (key: PlayHistoryKey) => Effect.Effect<PlayLog, LibraryError>
  // ...
}>()("LibraryService") {}
```

The caller provides `{ userId, gameId }`. No ambient context needed.

**When to use:** For records where the query already has the owner in its payload
(e.g., `PlayLog`). Already done.

#### Shape B — `ActiveProfile` service resolves owner from context (ambient)

```ts
class ActiveProfile extends Context.Service<ActiveProfile, {
  readonly userId: string
  readonly displayName: string
}>()("ActiveProfile") {}
```

Services that need the current-user read from context:

```ts
class LibraryService extends Context.Service<LibraryService, {
  readonly listGames: () => Effect.Effect<readonly GameRecord[], LibraryError>
}>()("LibraryService") {}

// Implementation reads ActiveProfile internally — not leaking it into the interface
const LibraryLayerLive: Layer.Layer<LibraryService, never, ActiveProfile | Database> =
  Layer.effect(LibraryService, Effect.gen(function* () {
    const { userId } = yield* ActiveProfile
    const db = yield* Database
    return {
      listGames: () => db.queryGames(userId)
    }
  }))
```

**When to use:** For operations where the owner is implicit in the session (listing
"my games", launching "my save"), keeping method signatures clean. This is the
Effect-idiomatic pattern: hide the dependency at construction time, not at call time.

**Source:** Effect official docs — *Managing Layers: Avoiding Requirement Leakage*  
https://effect.website/docs/requirements-management/layers/

> *"Service functions should avoid requiring dependencies directly… service
> operations should have the Requirements parameter set to never."*

### Owner in Domain Events

Once `ActiveProfile` is ambient, domain events must carry the resolved `userId` —
not a future-lookup reference:

```ts
export interface GameLaunchedEvent {
  readonly _tag: "GameLaunched"
  readonly userId: string     // resolved at emission time
  readonly gameId: string
  readonly launchedAt: Date
  readonly sessionId: string
}
```

---

## Section 2 — Principal Propagation Through Effect Services and RPC

### The Resolve-Once-at-the-Boundary Rule

The console-gaming model (Nintendo Switch, Steam) is instructive here: **the
"active account" is resolved once at session entry — not passed in on every API
call**. Every subsequent operation inherits that session context.

> *"Nintendo Switch does Multiple Accounts Right… Every Account is 'logged in' when
> the device turns on."*

**Source:** *Nintendo Switch Does Multiple Accounts Right* — Signal v. Noise (Medium)  
(Accessed via IGN/Nintendo support documentation 2026-07-14)

In Effect terms: the RPC handler layer (Hono server / `rpc-handler.ts` files) is
the session boundary. It resolves the active profile once and injects it as a Layer:

```ts
// In the Hono RPC middleware or app bootstrap
const resolveActiveProfile = (): Layer.Layer<ActiveProfile> => {
  // Single-user phase: always "default"
  // Future: read from session header / cookie / OS user
  const userId = process.env.KORRI_USER_ID ?? "default"
  return Layer.succeed(ActiveProfile, {
    userId,
    displayName: "Default User"
  })
}

// RPC handler
const handler = Effect.gen(function* () {
  const library = yield* LibraryService
  return yield* library.listGames()
}).pipe(
  Effect.provide(Layer.mergeAll(
    resolveActiveProfile(),
    LibraryLayerLive,
    // ...
  ))
)
```

### RPC Contract: Include Owner Dimension on Wire-Crossing Payloads

For payloads that cross network boundaries (device → portal, portal → source
machine), include `ownerId` explicitly so that:

1. The receiving side can validate the claimed identity (even without auth, a
   mismatch is diagnosable).
2. The contract is already multi-user-shaped when auth is added later.

```ts
// Effect Schema — wire contract
export const LaunchRequest = Schema.Struct({
  ownerId: Schema.String,   // ← add now
  gameId: Schema.String,
  releaseId: Schema.optional(Schema.String),
})
```

RPC tag convention: `entity.concept.action` (existing Korri convention) — no change
needed; the owner is in the payload, not the tag.

### Single-Occupancy Session Contract

For Korri's current model (one physical device, one active profile), the occupancy
service is simple:

```ts
// Phase 1: trivially single-occupant
class OccupancySession extends Context.Service<OccupancySession, {
  readonly activeUserId: string
}>()("OccupancySession") {}

const OccupancySessionLayerDefault = Layer.succeed(OccupancySession, {
  activeUserId: "default"
})

// Phase 2 (future, no rewrite): swap with a layer that reads from a profile store
const OccupancySessionLayerFromStore: Layer.Layer<OccupancySession, ..., ProfileStore> = ...
```

This is the same Layer-swap pattern used for Storybook harnesses vs. production —
the interface stays stable, only the Layer changes.

---

## Section 3 — Data Partitioning / Storage Scoping

### Industry Model: Steam's `userdata/<userId>/` Pattern

Steam's local data layout is the best industry precedent for a "single-device, many
accounts" system:

```
~/.steam/steam/userdata/<steamId>/         ← per-user root
  <AppId>/                                 ← per-game, per-user
    remote/                                ← cloud-sync save files
    local/                                 ← local config/saves
    screenshots/
```

**Source:** PCGamingWiki — *Glossary: Game Data*  
https://www.pcgamingwiki.com/wiki/Glossary:Game_data

RetroArch's community workaround for multi-user is equivalent: separate config base
directories per user, launched with a config argument. The takeaway is that
**a sub-directory keyed by a stable user ID is the universal per-user scoping
primitive**.

**Source:** RetroArch GitHub Issue #4749 — *Add profile system for multiple users*  
https://github.com/libretro/RetroArch/issues/4749

### Korri's XDG Path Extension

The existing `xdg-paths.ts` helpers (`korriDataPath`, `korriConfigPath`, etc.) are
the right foundation. Extend them with a user-scoped variant:

```ts
// xdg-paths.ts additions
export function korriUserDataPath(
  env: XdgPathEnv,
  userId: string,
  ...segments: readonly string[]
): string {
  return korriDataPath(env, "users", userId, ...segments)
}

export function korriUserConfigPath(
  env: XdgPathEnv,
  userId: string,
  ...segments: readonly string[]
): string {
  return korriConfigPath(env, "users", userId, ...segments)
}

export function korriUserStatePath(
  env: XdgPathEnv,
  userId: string,
  ...segments: readonly string[]
): string {
  return korriStatePath(env, "users", userId, ...segments)
}
```

Resulting layout:

```
~/.local/share/korri/
  users/
    default/           ← the implicit single user, migrated here
      library/
      saves/
  shared/              ← non-user-scoped data (catalogs, assets)
    assets/
    cache/

~/.config/korri/
  users/
    default/
      prefs.yaml
```

**XDG Spec source:** https://specifications.freedesktop.org/basedir/

### Migration Strategy: Expand → Backfill → Contract

The standard three-phase migration for retrofitting ownership:

```
Phase 1 – Expand
  Add userId field to all affected schemas (optional/nullable or defaulted to "default").
  Add user-scoped path helpers (no moves yet).
  Add ownerId to RPC contracts as optional → write it on new records.

Phase 2 – Dual-path read
  New records: written to users/<userId>/.
  Old records: read from legacy paths, wrapped with userId: "default".
  ProseQL / config loaders: read both paths, merge with userId from path context.
  PlayLog already has userId — no migration needed; backfill userId: "default"
  on any legacy records that lack it.

Phase 3 – Contract (optional, when a second real user is needed)
  Move existing legacy data: mv korri/{data} korri/users/default/{data}
  Add symlink at the old path pointing to new: ln -s users/default/{data} {data}
    (preserves compatibility with any external tools still pointing to old paths)
  Make userId required (remove optional/default).
  Remove legacy read-path fallback.
```

**Source:** WorkOS multi-tenant migration guidance — expand/backfill/contract pattern  
https://workos.com/blog/developers-guide-saas-multi-tenant-architecture

**Key constraint:** Because Nix manages the system derivation, path migration must be
handled in activation scripts or a migration service, not assumed during Nix build.
The Nix module should declare the desired state; the runtime handles the actual
data move.

---

## Section 4 — Session / Occupancy Modeling

### Console Reference: Nintendo Switch's Single-Active-Multiple-Accounts Model

The Nintendo Switch design is the gold standard for "single occupancy, multi-account"
systems:

- Up to 8 user accounts exist on one console.
- **All accounts are "active" on boot** — no explicit login flow required to enter
  the profile picker.
- Each game session is attributed to the **account that launched it**; save data is
  keyed by `(account, game)`.
- The console makes it trivially easy to switch accounts between game launches
  (profile picker at app start), not mid-session.
- Accounts are purely local constructs until linked to a Nintendo Account for online
  features.

**Source:** Nintendo Switch Support — *Users*  
https://www.nintendo.com/sg/support/switch/user/index.html

**Source:** IGN — *How to Create New User Profiles on the Switch 2*  
https://www.ign.com/wikis/nintendo-switch-2/How_to_Create_New_User_Profiles_on_the_Switch_2

### Korri Occupancy State Machine

Model the occupancy as a tagged union (matches existing Korri `_tag` conventions):

```ts
// product/platform/session/occupancy-session.ts
export type OccupancyState =
  | { readonly _tag: "NoActiveProfile" }
  | { readonly _tag: "ProfileActive"; readonly userId: string; readonly displayName: string }

// In single-user phase: always ProfileActive with "default"
// In multi-user phase: set at boot / profile-picker, cleared on shutdown/switch
```

The `ForegroundSessionOwner` and `ForegroundSessionLifecycle` already handle the
"one game at a time" constraint. The occupancy state sits one level above: "one
user is active at a time on this device". These are independent dimensions:

```
OccupancySession:     ProfileActive("alice")
ForegroundSession:    Running(gameId="super-mario")
```

The occupancy session is the **owner** of the foreground session. When the profile
switches, the old game session should be terminated first (enforce the occupancy rule
at the ForegroundSessionOwner level, same pattern as the external idle check via
`consultExternalIdle`).

### The Korri "Active Profile" Service as the Session Seam

```ts
// product/platform/session/active-profile.ts

export interface ActiveProfileShape {
  readonly userId: string
  readonly displayName: string
}

class ActiveProfile extends Context.Service<ActiveProfile, ActiveProfileShape>()(
  "ActiveProfile"
) {}

// Production (single-user phase)
export const ActiveProfileLayerDefault: Layer.Layer<ActiveProfile> =
  Layer.succeed(ActiveProfile, {
    userId: "default",
    displayName: "Default"
  })

// Naming: <Service>Layer<Variant> — matches Korri convention
export const ActiveProfileLayerInMemory = (
  profile: ActiveProfileShape
): Layer.Layer<ActiveProfile> =>
  Layer.succeed(ActiveProfile, profile)
```

Stories and tests override with `ActiveProfileLayerInMemory({ userId: "test-user", ... })`.
Production uses `ActiveProfileLayerDefault` until a profile-picker UI exists.

---

## Section 5 — YAGNI Boundary: Model Now vs. Defer

### Mental Model

> *"Physical isolation can change later. Logical tenancy can't."*  
> — WorkOS (above)

The YAGNI line runs between: **shaping the model** (cheap, now) and **building the
mechanisms** (auth, switching UI, permission system — defer).

### Model Now (Zero Real Cost, Prevents Rewrite Later)

| What | Why Now |
|---|---|
| `userId` on every personally-owned Schema record | Enables correct domain events; prevents schema migrations under load |
| `ActiveProfile` as an Effect service (`Context.Service`) | Makes the test/harness seam free; changes the wiring, not the interface |
| `ownerId` in RPC wire schemas (optional → later required) | Wire schemas are the hardest thing to change after clients exist |
| `korriUserDataPath(env, userId, ...)` helpers in `xdg-paths.ts` | Two-line addition; defers all actual file moves |
| `PlayHistoryKey: { userId, gameId }` ← already done | ✓ Already correctly modeled |
| `OccupancyState` tagged union in `session/` | Establishes the vocabulary; single-user phase trivially implements it |
| Naming the default user `"default"` (not empty string or null) | Makes backfill mechanical; a stable sentinel is better than null |

### Defer (Real Complexity, No Forcing Function Yet)

| What | When to Build |
|---|---|
| Auth tokens, password, SSO, or any credential store | When a second real human needs access to Korri on the same device |
| User management UI (add/remove profiles, set names/avatars) | When a second real human exists |
| Permission / RBAC system | When users have meaningfully different access levels |
| Per-user network isolation or resource quotas | If/when multi-user actually lands |
| User-switching mid-session | Build when the profile-picker UI is needed |
| Encrypted per-user storage or OS-level separation | If personal data security is a product requirement |
| Membership / social graph between users | Not a Korri use case in the foreseeable future |
| Cross-device user identity sync | After a single device works with multiple profiles |

### The YAGNI Signal: When to Cross the Line

The right trigger to build a feature from the "Defer" column is:
**a second real person is actively blocked from using the device because of missing
user separation**. Until then, all the scaffolding above (ids, layers, paths) is
sufficient and costs almost nothing.

---

## Section 6 — Clerk / WorkOS "Active Organization" Analogy

Clerk's "Active Organization" feature (for multi-tenant SaaS) is a useful design
analogy for Korri's "Active Profile" pattern:

- Each session carries exactly one **active organization** (= active profile).
- Tokens are **minted per active org** (= per active profile); switching orgs mints
  a new session, not a mutation of the old one.
- The middleware resolves active org from URL slug or session claim at the request
  boundary — downstream code reads from context.
- **Clerk explicitly advises against org slugs in URLs if most users belong to one org.**
  Korri's single-user-at-a-time model is analogous: don't add profile IDs to the URL
  scheme until multiple real profiles exist.

**Source:** Clerk — *Use Organization slugs in URLs*  
https://clerk.com/docs/guides/organizations/org-slugs-in-urls

---

## Section 7 — Korri-Specific Recommendations

### Priority Order

1. **Add `ActiveProfile` service** (`product/platform/session/active-profile.ts`)  
   `Layer.succeed` with `userId: "default"`. Wire it into the API server middleware
   so every RPC handler has it available via `yield* ActiveProfile`.

2. **Extend `xdg-paths.ts`** with `korriUserDataPath / korriUserConfigPath /
   korriUserStatePath` taking `userId` as second argument. No file moves yet.

3. **Audit domain records** for any personal data missing `userId`:
   - `PlayLog` ✓ (already has `userId`)
   - Library prefs, per-game settings, hook profiles, presets — check each for owner
   - Collections that are user-curated vs. system-provided — separate concerns

4. **Add `ownerId` to RPC wire schemas** as an optional `Schema.String` with a
   comment: "Required in multi-user phase; defaults to active profile for callers
   that omit it."

5. **Document the occupancy contract** in `docs/solutions/architecture-patterns/`
   (matching existing solution doc convention). The doc should describe:
   - `OccupancyState` ADT
   - Relationship between occupancy and `ForegroundSessionOwner`
   - Invariant: at most one profile is "active" at a time on a device

6. **Backfill `userId: "default"` on any legacy in-filesystem records** that
   currently lack it, as a migration activation step (Nix `systemd.services`
   or activation script).

### What NOT to Do

- **Do not** pass `userId` as a parameter through every public service method —
  that leaks the dependency and makes the interface unstable. Use the `ActiveProfile`
  service (Layer injection) instead.
- **Do not** use `null` or `""` as the "no user" sentinel — use `"default"` as the
  stable single-user token so backfills are mechanical.
- **Do not** add a profile-picker UI, user management screen, or login flow until
  there is a second real human blocked by their absence.
- **Do not** create separate XDG `$HOME` directories per user at the OS level —
  that's an OS-level isolation that defeats the "single running device" model and
  makes the Nix NixOS module configuration much more complex.

---

## References

| Source | URL |
|---|---|
| WorkOS — Developer's Guide to SaaS Multi-Tenant Architecture (Dec 2025) | https://workos.com/blog/developers-guide-saas-multi-tenant-architecture |
| SE Stack Exchange — Aggregates and Tenant IDs (DDD) | https://softwareengineering.stackexchange.com/questions/397162/aggregates-and-tenant-ids |
| Effect Official Docs — Managing Layers | https://effect.website/docs/requirements-management/layers/ |
| Clerk — Organization slugs in URLs (Active Organization pattern) | https://clerk.com/docs/guides/organizations/org-slugs-in-urls |
| PCGamingWiki — Glossary: Game Data (Steam userdata layout) | https://www.pcgamingwiki.com/wiki/Glossary:Game_data |
| RetroArch GitHub — Issue #4749 (multi-user profiles) | https://github.com/libretro/RetroArch/issues/4749 |
| Nintendo Switch Support — Users | https://www.nintendo.com/sg/support/switch/user/index.html |
| IGN — Create New User Profiles on Switch 2 | https://www.ign.com/wikis/nintendo-switch-2/How_to_Create_New_User_Profiles_on_the_Switch_2 |
| Freedesktop XDG Base Directory Specification | https://specifications.freedesktop.org/basedir/ |
| Clerk — How to Design a Multi-Tenant SaaS Architecture | https://clerk.com/blog/how-to-design-multitenant-saas-architecture |

---

## Quick-Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│  Multi-User Readiness — Korri Cheat Sheet                       │
│                                                                 │
│  MODEL NOW                     DEFER                           │
│  ─────────────────────         ──────────────────────          │
│  userId on Schema records      Auth / credentials              │
│  ActiveProfile Effect service  User management UI              │
│  ownerId on RPC schemas        Permission/RBAC system          │
│  korriUserDataPath helpers     Per-user network isolation       │
│  OccupancyState ADT            Mid-session user switching       │
│  userId: "default" sentinel    Encrypted user vaults           │
│                                                                 │
│  ALREADY DONE                                                   │
│  ─────────────────────                                          │
│  PlayLog.userId + PlayHistoryKey (userId, gameId)              │
│  XDG path helpers (korriDataPath etc.)                         │
│  LayerLive/LayerInMemory naming convention                     │
│                                                                 │
│  INVARIANTS TO ENFORCE                                          │
│  ─────────────────────                                          │
│  1. Every personal record owns exactly one userId              │
│  2. ActiveProfile resolves ONCE at the request boundary        │
│  3. Service interfaces keep R = never (no leaked deps)         │
│  4. Domain events carry resolved userId, not a deferred ref    │
└─────────────────────────────────────────────────────────────────┘
```
