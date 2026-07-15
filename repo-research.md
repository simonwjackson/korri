# Repository Research — Multi-User Readiness Assessment

**Date:** 2026-07-14  
**Scope:** Korri codebase — how close it is to being modeled as a multi-user system  
**Method:** Read-only survey of `product/`, `packages/`, `docs/`, `work/`

---

## 1. Existing User / Account / Identity Concepts

### 1a. `UserRecord` and `UserPayload` — Schema already exists

**File:** `product/platform/library/config/records/user.ts`

```ts
export const DEFAULT_USER_ID = "default"
// Comment: "Stand-in user id used wherever a concrete user is required but no
// per-request user is resolved yet (single-user alpha). Play history and
// other per-user data are keyed by this until real current-user resolution lands."
```

`UserPayload` carries:
- `displayName?: string`
- `favorites?: PlayableId[]`
- `hidden?: PlayableId[]`
- `launch?: LaunchBlock` — per-user default launcher
- `presets?: PresetMapPayload`
- All inheritable policy fields (`moonlight`, `preferences`, `plugin`, `env`, `cwd`, `argsAppend`, `patches`, `hooks`)

`UserRecord` = `{ id: string, ...UserPayload }`.

The schema is rich and intentional. A `UserNotFound` error class also exists:

**File:** `product/platform/library/config/errors.ts`

```ts
export class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: string
}> {}
```

### 1b. `PlayLog` — already user-keyed at the schema layer

**File:** `product/platform/library/config/records/play-log.ts`

```ts
export interface PlayHistoryKey {
  readonly userId: string
  readonly gameId: string
}
// Comment: "Identity of a play log: play history is personal, so it is keyed by
// the (user, game) pair — never by the game or release alone."
```

`PlayLog` schema has `userId: Schema.String` as a required field.

### 1c. Play-log file store — per-user directory partitioning already wired

**File:** `product/platform/library/play-log-store.ts`

```ts
const dirFor = (key: PlayHistoryKey) =>
  join(root, encodeURIComponent(key.userId))
const pathFor = (key: PlayHistoryKey) =>
  join(dirFor(key), `${encodeURIComponent(key.gameId)}.json`)
```

The on-disk structure `<root>/<userId>/<gameId>.json` is already per-user. This is the single seam that has the strongest multi-user readiness.

### 1d. `users` collection in `ConfigSnapshot` and `ReadableConfigSnapshot`

**File:** `product/platform/library/config/cascade-resolver.ts`

```ts
export interface ConfigSnapshot {
  readonly users: ReadonlyMap<string, UserRecord>
  // ...
}
export interface ReadableConfigSnapshot {
  readonly users: ReadonlyMap<string, UserRecord>
  // ...
}
```

The cascade resolver treats `users` as a first-class layer. Both cascade sequences thread userId:

- Seven-layer: `global → user → system → launcher → game → preset → override`
- Readable: `host → user → system → app → runtime → library-item → contained → release → profile → override`

`ResolveInputs` and `ResolveReadableLaunchInputs` both have `userId?: string`.

---

## 2. Where Single-User Assumptions Are Baked In

### 2a. `DEFAULT_USER_ID` fallback in the launch RPC handler

**File:** `product/apps/portal/api/library/launch.rpc-handler.ts:175`

```ts
import { DEFAULT_USER_ID } from "@platform/library/config/records/user"
// ...
foregroundSessionHost.playRecordingCoordinator?.beginLaunch({
  launchId,
  userId: payload.userId ?? DEFAULT_USER_ID,  // ← hard fallback
  gameId: payload.id,
  ...
})
```

If no `userId` is passed to `app.library.launch`, play history records under `"default"`. This is the primary single-user collapse point on the write path.

### 2b. `DEFAULT_USER_ID` fallback in the library list (play stats read)

**File:** `product/platform/library/proseql/library-repository.ts:1090`

```ts
store.load({ userId: DEFAULT_USER_ID, gameId: entry.id }),
```

This is inside `attachPlayStats()` — the function that decorates `PlayableLibraryEntry` list results with `playStats`. It always loads history for the default user, regardless of any request context. Play stats shown in the library UI are always the default user's stats.

### 2c. Feature gates — `userId` defaults to `"local"`, not wired to identity

**File:** `product/platform/react/gates/FeatureGatesProvider.tsx`

```tsx
interface FeatureGatesProviderProps extends PropsWithChildren {
  readonly userId?: string
}
export function FeatureGatesProvider({ userId = "local", ... })
```

localStorage key is `gates:${environment}:${userId}`. The `userId` prop is never populated from any real user identity at the composition root; it defaults to the static string `"local"`.

### 2d. Favorites in the shift UI are ephemeral widget state

**File:** `product/surfaces/web/shift/pages/ShiftLibraryDeck.tsx`

```tsx
const [favorites, setFavorites] = useState<ReadonlySet<string>>(
  () => new Set(games.filter(game => game.favorite).map(game => game.id)),
)
```

Favorites toggling is in-memory only (`useState`). `UserRecord.favorites` and `UserRecord.hidden` fields exist in the schema but are not read from the user record in the library projection, and mutations are not persisted back to the config cascade.

### 2e. Sessiond sessions carry no user identity

**File:** `product/apps/portal/api/session/status.rpc.ts`

```ts
export class SessionStatusPayload extends Schema.Class<SessionStatusPayload>(
  "SessionStatusPayload",
)({}) {}  // ← no userId field
```

Sessions are identified by `launchId` only. The sessiond operator model is explicitly one daemon per host (not per user):

> "One sessiond per foreground-capable host. Sessiond owns the truth about whether the host can launch a managed app, what is currently running, and whether the host is back to its role-specific idle state."  
> — `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`

Task-008 explicitly defers per-user session ownership:
> "**task-008** — multi-user support (sessiond ownership becomes per-user)."

### 2f. XDG / storage paths are single-user (single `$HOME`)

**File:** `product/platform/config/xdg-paths.ts`

```ts
export function korriStatePath(env, ...segments): string {
  return join(requireXdgStateHome(env), "korri", ...segments)
}
// requireXdgStateHome → env.XDG_STATE_HOME ?? join(env.HOME, ".local", "state")
```

All Korri state, config, cache, and data paths resolve against the process environment's `$HOME` / `XDG_*` variables. There is no user-keyed directory partitioning in these helpers (except the play-log store, which explicitly adds `encodeURIComponent(key.userId)`).

Affected paths:
- Peer store: `korriStatePath(env, "peers.json")` — singleton, not per-user
- Chromium state: `korriStatePath(env, "chromium")` — singleton
- Game-stream intent file: `join(XDG_RUNTIME_DIR, "korri-game-stream", "next-launch.json")`

### 2g. Steam plugin state root is global

**File:** `product/plugins/steam/src/plugin.ts`

```ts
export const steamRuntimePaths = {
  stateRoot: "/var/lib/korri/steam",
} as const
// and:
stateRoot: process.env.STEAM_HOME ?? "/var/lib/korri/steam",
```

The Steam home, log dir, and app manifests all live under a single global path. No per-user segregation.

### 2h. Install-control authorization is a shared secret, not user-scoped

**File:** `product/apps/portal/api/plugin-install/install-control-authorization.ts`

```ts
export const INSTALL_CONTROL_COOKIE = "korri_install_control"
// authorized = constantTimeEqual(token, KORRI_INSTALL_CONTROL_SECRET)
```

Install control is a binary authorized/not-authorized gate keyed on a single shared secret per host. No per-user install authorization.

### 2i. `app.plugin.install.request` and `.status` carry no userId

**File:** `product/apps/portal/api/plugin-install/request.rpc.ts`

```ts
export class RequestPluginInstallPayload extends Schema.Class<...>()({
  providerId: Schema.String,
  appId: Schema.String,
  playableId: Schema.optional(Schema.String),
  mode: Schema.optional(Schema.Literals(["install", "update"])),
  source: Schema.optional(EntrySource),
}) {}
```

Plugin install state is device-global; no user dimension.

### 2j. Stream-control RPCs carry no userId

`app.stream-control.config.get`, `app.stream-control.state.get`, `app.stream-control.action.set`, `app.stream-control.controls.get` — all have empty payload objects or device-global payloads. Stream control is per-host, not per-user.

### 2k. `app.session.stop/freeze/thaw` carry no userId

Sessions are stopped/frozen/thawed by `launchId` alone, not by user.

---

## 3. RPC Surface — userId Inventory

| RPC tag | userId present? | Notes |
|---|---|---|
| `app.library.launch` | ✅ optional | Falls back to `DEFAULT_USER_ID` at handler |
| `app.library.launch.dry-run` | ✅ optional | Passed to cascade resolver |
| `app.server.stream.prepare` | ✅ optional | Forwarded to `prepareStreamLaunch` |
| `app.stream.prepare` | ✅ optional | Passed to cascade resolver |
| `app.catalog.snapshot` | ❌ | Machine-scope; `source.hostId` is machine identity |
| `app.session.status` | ❌ | No user context |
| `app.session.stop/freeze/thaw` | ❌ | `launchId` only |
| `app.source.status` | ❌ | Machine status only |
| `app.server.status` | ❌ | `serverId`/`displayName` are machine fields |
| `app.plugin.install.request` | ❌ | No user context |
| `app.plugin.install.status` | ❌ | No user context |
| `app.stream-control.*` | ❌ | All device-global |
| `app.acquisition.*` | ❌ | No user context |

**Summary:** userId penetrates the launch and stream-prepare RPCs but stops at the session, plugin, catalog, and device-control surfaces.

---

## 4. Session Lifecycle Model — Single-Occupant by Design

Sessiond's foreground session model is single-occupant per host by explicit design:

**File:** `product/platform/session/foreground-session-owner.ts` (doc comment):
> "ForegroundSessionOwner is an adapter pipeline orchestrator with preflight re-entry protection: it owns `prepare → spawn → foreground → teardown → verifyReady` for a single launch."

**File:** `product/platform/library/sessiond-managed-launch-protocol.ts` — the `SessiondManagedLaunchMode` union represents one slot:
`"stopped" | "starting" | "home" | "idle" | "launching" | "game" | "restoring" | "recovering"`

There is exactly one mode; concurrent sessions for different users are architecturally impossible without revisiting this model.

`launchId` is a session correlator but carries no user identity. The launch RPC starts recording `(userId, gameId)` before spawn, but that userId never propagates into the sessiond protocol itself.

---

## 5. Federation / Source-Machine — Machine Identity, Not User Identity

**File:** `product/platform/api/rpc/entry-source.ts`

```ts
// hostId is the advertised host identifier (KORRI_STREAM_ADVERTISE_HOST_ID)
// controlUrl is the absolute URL of the server that owns this entry
// isLocal is true when the entry was produced by THIS server
```

The federation model is:
- **Peers** are discovered by mDNS and identified by `hostId` (machine identifier)
- `EntrySource { hostId, controlUrl, isLocal }` is a machine pointer, not a user pointer
- Peer store (`peers.json`) is a singleton: one file per machine, listing known peer machines
- Remote launch routing uses `source.hostId` to select the peer's control URL

There is no concept of "user on peer machine". An entry from peer B carries B's `hostId`, but which user on B owns it is not modeled.

---

## 6. Seams That Already Abstract Ownership vs. Seams That Hardcode a Single User

### Seams already abstracted (multi-user ready)

| Seam | Evidence |
|---|---|
| Config cascade resolver | `ResolveInputs.userId?: string`; `ConfigSnapshot.users: ReadonlyMap`; seven-layer fold |
| Play-log schema | `PlayHistoryKey { userId, gameId }`; `PlayLog.userId: string` |
| Play-log file store | `<root>/<userId>/<gameId>.json` — per-user directory |
| Play-recording coordinator | `LaunchRecordingContext.userId: string`; coordinator is userId-aware |
| `UserRecord` schema | `id`, `displayName`, `favorites`, `hidden`, full inheritable policy |
| `UserNotFound` error | Propagated through resolution error union |
| Launch + dry-run RPC schemas | `userId?: string` in payload |
| `ControlLaunchRequest` / result | `userId?: string` in control surface |

### Seams that hardcode a single user (the gaps)

| Seam | File | Gap |
|---|---|---|
| Play stats attach on list | `library-repository.ts:1090` | Always `DEFAULT_USER_ID` |
| Play recording default | `launch.rpc-handler.ts:175` | `payload.userId ?? DEFAULT_USER_ID` |
| Feature gate storage key | `FeatureGatesProvider.tsx` | `userId` defaults to `"local"` |
| Favorites persistence | `ShiftLibraryDeck.tsx` | useState only, no UserRecord write-back |
| UserRecord hidden/favorites read | `library-repository.ts` | Fields exist in schema, never read in projection |
| Session identity | `sessiond.ts`, protocol | `launchId` carries no userId |
| Storage paths (XDG, peers, chromium) | `xdg-paths.ts`, `peer-store.ts` | All keyed on process `$HOME` |
| Steam home | `steam/src/plugin.ts` | Single global `/var/lib/korri/steam` |
| Install control | `install-control-authorization.ts` | Shared secret, not per-user |
| Plugin install state | `plugin-install/*.rpc.ts` | No user dimension on wire |
| Stream control | `stream-control/*.rpc.ts` | Device-global, no userId |

---

## 7. Explicit Deferral Documentation

### Parking lot item

**File:** `work/parking-lot/01KSRGFP074RDRTVJ584FHN90A-multi-user-support.md`

> "Korri currently assumes a single implicit user on the device. Add a real multi-user model: per-user identity, per-user library/save state, per-user sessions, and per-user paired hosts."
>
> Acceptance criteria:
> - Identity model documented in `docs/solutions/`
> - Library, session, and save-state surfaces are scoped to a user (no implicit global state)
> - Portal UI for user selection / switching
> - Live-USB VM smoke covers at least two users without state bleed
>
> "Large; promote to `se-plan` before execution."

### Sessiond operator model doc

**File:** `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`

> "**task-008** — multi-user support (sessiond ownership becomes per-user)."

### Config cascade brief

**File:** `docs/briefs/2026-05-21-korri-config-cascade-brief.md`

> "Single-user-today, future multi-user. The Korri owner configures his game library by hand-editing YAML."
> "Introduce `users` as a first-class layer now, even with only a `default` user, to avoid retrofitting later."
> "Structure is in place for multi-user."

### Physical-host lifecycle truth doc

**File:** `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`

> "If a future deployment shape ever authenticates `/api/rpc` (see `../work/parking-lot/...stop-running-as-root` and `...multi-user-support`), the policy can flip from 'redact' to 'include and authenticate' without changing the wire schema."

---

## 8. Rough Readiness Assessment

### What is already multi-user aware (no change needed)

- **Config cascade resolver** — structurally sound; `userId` is an optional first-class input. Passing a real `userId` threads it through the seven-layer fold correctly. `UserNotFound` is already a typed error.
- **Play history** — schema, file layout, and coordinator are all per-user. The `(userId, gameId)` keying is correct.
- **Launch and dry-run RPC schemas** — `userId` is already an optional field on wire.
- **UserRecord schema** — `favorites`, `hidden`, `displayName`, launch policy, presets — all defined and decode-validated.

### What requires one targeted change to un-hardcode

- **Play stats on library list** (`library-repository.ts:1090`): pass a real `userId` from the request context instead of `DEFAULT_USER_ID`. Requires the list RPC/handler to accept and thread a `userId`.
- **Play recording default** (`launch.rpc-handler.ts:175`): same; the fallback to `DEFAULT_USER_ID` can be removed once callers always supply a `userId`.
- **Feature gate storage key** (`FeatureGatesProvider.tsx`): wire the `userId` prop from the authenticated user context instead of defaulting to `"local"`.

### What requires new design work

| Domain | Gap | Design needed |
|---|---|---|
| **Current-user resolution** | Nothing in the system resolves "who is the current user right now". No session token, no identity seam, no authenticated request header. | Add a current-user context seam (session cookie, header, atom, or layer). |
| **Favorites / hidden write-back** | `UserRecord.favorites` and `.hidden` are schema-ready but never read from or written to by the library projection or UI. | Add a `user.library.update` RPC (or mutation on existing user surface); read favorites from snapshot in library list. |
| **Sessiond sessions — no userId** | `launchId` correlates a session but carries no user. Task-008 explicitly says "sessiond ownership becomes per-user". | Propagate `userId` into session start request and managed-launch protocol; correlate in the session status response. |
| **XDG paths** | `korriStatePath`, `korriDataPath`, etc. are per-process-user, not per-Korri-user. Peers, chromium state, and other singletons are not partitioned. | Decide whether Korri users map to OS users (simplest) or add a `userId` segment to Korri-managed paths. |
| **Steam home** | `/var/lib/korri/steam` is global. | Either per-OS-user (if Korri users = OS users) or `STEAM_HOME/<userId>`. |
| **Install control** | Shared secret, not per-user. | Extend to user-scoped authorization (after deciding the identity model). |
| **Plugin install state** | No userId on wire. | Add optional `userId` to `app.plugin.install.request` and `.status`. |
| **Federation / source machines** | `hostId` is machine identity. A remote entry carries no info about which user on the remote machine owns it. | Decide whether per-user library federation is in scope; if so, `EntrySource` may need a `userId` dimension. |
| **Portal UI** | No user selection / switching UI exists. | Task-008 AC3: "Portal UI for user selection / switching." |

### Overall readiness: **Foundation laid, identity seam missing**

The config cascade, play-history data model, and launch RPC schemas are deliberately structured for multi-user. The `DEFAULT_USER_ID` constant is explicitly named a temporary stand-in and is used in only two places. The schema work is complete.

The blocking gap is that **there is no current-user resolution seam** — nothing in the request lifecycle resolves "which user is making this request" into a concrete `userId`. Until that seam exists, the `userId` fields in the RPC payloads are dead weight (callers have nothing to put there). The sessiond lifecycle and XDG path conventions are also single-user by design and will need coordinated treatment alongside the identity seam.

---

## 9. File Map (key paths cited)

| Path | Relevance |
|---|---|
| `product/platform/library/config/records/user.ts` | `UserRecord`, `UserPayload`, `DEFAULT_USER_ID` constant + alpha comment |
| `product/platform/library/config/records/play-log.ts` | `PlayHistoryKey`, `PlayLog` — per-user keying |
| `product/platform/library/play-log-store.ts` | File store with per-user directory (`encodeURIComponent(key.userId)`) |
| `product/platform/library/config/cascade-resolver.ts` | `ConfigSnapshot.users`, `ResolveInputs.userId`, cascade fold |
| `product/platform/library/config/errors.ts` | `UserNotFound` error class |
| `product/platform/library/proseql/library-repository.ts:1090` | `DEFAULT_USER_ID` hardcode in play stats attach |
| `product/apps/portal/api/library/launch.rpc-handler.ts:175` | `DEFAULT_USER_ID` hardcode in play recording |
| `product/apps/portal/api/library/launch.rpc.ts` | `LaunchLibraryPayload.userId?: string` |
| `product/apps/portal/api/library/dry-run.rpc.ts` | `DryRunLaunchPayload.userId?: string` |
| `product/apps/portal/api/server/prepare.rpc.ts` | `ServerPrepareStreamPayload.userId?: string` |
| `product/apps/portal/api/stream/prepare.rpc.ts` | `PrepareStreamPayload.userId?: string` |
| `product/apps/portal/api/library/play-recording-coordinator.ts` | `LaunchRecordingContext.userId: string` |
| `product/apps/portal/api/plugin-install/install-control-authorization.ts` | Shared-secret gate, no user dimension |
| `product/apps/portal/api/session/status.rpc.ts` | Empty payload — no userId |
| `product/platform/api/rpc/entry-source.ts` | `EntrySource.hostId` — machine identity only |
| `product/platform/config/xdg-paths.ts` | `korriStatePath`, `korriDataPath` — single-user paths |
| `product/platform/react/gates/FeatureGatesProvider.tsx` | `userId` defaults to `"local"`, not wired |
| `product/plugins/steam/src/plugin.ts` | `stateRoot: "/var/lib/korri/steam"` — global |
| `product/surfaces/web/shift/pages/ShiftLibraryDeck.tsx` | Favorites in `useState` — not persisted |
| `product/platform/library/playable-library.ts` | `PlayableLibraryEntry.userData` (open schema) and `playStats` |
| `work/parking-lot/01KSRGFP074RDRTVJ584FHN90A-multi-user-support.md` | Explicit backlog item; full acceptance criteria |
| `docs/briefs/2026-05-21-korri-config-cascade-brief.md` | "Single-user-today, future multi-user"; structure documented |
| `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` | task-008 cross-cutting backlog entry |
