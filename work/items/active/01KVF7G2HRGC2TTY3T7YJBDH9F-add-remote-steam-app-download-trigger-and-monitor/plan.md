---
title: feat: Add remote Steam app download trigger and monitor
type: feat
status: active
date: 2026-06-19
origin: work/items/active/01KVF7G2HRGC2TTY3T7YJBDH9F-add-remote-steam-app-download-trigger-and-monitor/item.md
verify_command: "bun test product/apps/portal/api/plugin-install/install-control-authorization.test.ts product/apps/portal/api/plugin-install/request.rpc-handler.test.ts product/apps/portal/api/plugin-install/status.rpc-handler.test.ts product/apps/portal/api/hono-app.test.ts product/apps/portal/api/server/rpc-server.test.ts product/platform/library/config/app-install-metadata.test.ts product/plugins/steam/src/observability/install-state.test.ts product/plugins/steam/src/observability/install-api.test.ts product/plugins/steam/src/observability/install-signals.test.ts product/plugins/steam/src/app-control/install-trigger.test.ts product/plugins/steam/src/app-control/install-request-ledger.test.ts product/plugins/steam/src/plugin.test.ts product/plugins/steam/src/boundary.test.ts product/plugins/steam/nix/nixos-module.test.ts product/apps/portal/features/home/plugin-install-rpc-layer.test.ts product/apps/portal/features/home/library-rpc-layers.test.ts product/themes/shift/pages/ShiftHomeReadyBody.test.tsx"
---

# feat: Add remote Steam app download trigger and monitor

## Summary

Add a first-class remote install/update path for Steam games in Korri. Korrid exposes typed plugin-install RPCs, the Steam first-party plugin triggers the logged-in local Steam client with the proven `korri-steam-guest -console +app_install <appid>` command path, and Portal monitors honest install state from Steam manifests and logs without taking custody of Steam credentials or depending on Steam UI interaction as the operator workflow.

## Problem Frame

Korri can launch already-installed Steam apps and now exposes rich Steam launch lifecycle observability. Operators still cannot install or update a Steam app from Korri UI/API: they must leave Korri, use Steam UI, or perform ad hoc shell commands. The recent Bandai spike proved that the local logged-in Steam client can install and uninstall apps through `korri-steam-guest -console +app_install <appid>` / `+app_uninstall <appid>`, and that progress can be observed from `steamapps/appmanifest_<appid>.acf`, `steamapps/libraryfolders.vdf`, and `logs/content_log.txt`.

The product gap is an orchestration surface, not a credential or downloader problem. The implementation should treat the trigger as an asynchronous request, then prove state by reading Steam-owned files/logs.

## Requirements

- R1. Expose a typed Korri/Korrid API for requesting a Steam app install or update for an owned AppID through the logged-in local Steam client.
- R2. Keep Steam-specific behavior inside `product/plugins/steam`; generic app/server/platform code must dispatch through plugin handlers and must not import Steam internals.
- R3. Report honest states including `not-installed`, `requested`, `queued`, `downloading`, `installing`, `installed`, `failed`, and `unknown` from Steam manifests/logs.
- R4. Return asynchronous trigger acknowledgement only as acknowledgement; do not claim an install is complete until manifest/log observation proves it.
- R5. Surface enough status for Portal to trigger and monitor installs remotely without using Steam UI as the primary operator interaction.
- R6. Preserve credential safety: no Steam credential storage in Korrid; no default SteamCMD, SteamKit, DepotDownloader, or private Steam IPC path.
- R7. Guard the local Steam console command path as a first-party Steam plugin capability, because it is client-forwarded and proven on Bandai but not an official public API.
- R8. Keep progress honest: expose byte counts only when present in manifests/logs; otherwise show coarse/indeterminate state.
- R9. Make request/status idempotent across Portal retries and page re-entry by correlating status by provider/app/request identity.
- R10. Gate request/status RPCs behind an explicit install-control authorization layer, distinct from feature gates, so arbitrary unauthenticated LAN callers cannot trigger downloads or enumerate install status by default.
- R11. Authorize AppIDs before spawning by requiring the AppID to be present in Korri's provider-neutral catalog/library install metadata; status also requires the same allowlist or a matching request id from the ledger.
- R12. Keep cancel, uninstall, library-folder selection UI, private protocol experiments, and window/focus fixes out of this slice unless they are needed to avoid a broken install request/status contract.

## Scope Boundaries

- Do not store Steam username, password, Steam Guard tokens, refresh tokens, or cookies in Korrid.
- Do not implement SteamCMD, SteamKit, DepotDownloader, or SteamClient private IPC as the v1 product path.
- Do not add a second Portal polling loop for basic foreground launch lifecycle; install state gets its own typed install status path and should not change launch lifecycle semantics.
- Do not solve the known launchId correlation gap for 30XX in this item; keep it referenced as follow-up `01KVF07E2Z5N87FRPYFC1Q4JMJ`.
- Do not build a full acquisition/storefront flow, entitlement purchase flow, or library-folder picker in v1.
- Do not promise MB/s or ETA unless the observer has evidence for those fields.
- Do not expose or add uninstall/cancel capabilities in v1; they require separate destructive-action design, confirmation, and authorization.
- Do not chase unrelated Steam game runtime issues such as FEZ/VVVVVV compatibility or window placement/focus/fullscreen.

### Deferred to Follow-Up Work

- `01KVF07E2Z5N87FRPYFC1Q4JMJ`: fix deployed Steam lifecycle launchId correlation.
- A cancel-download API if a reliable local-client command can be validated and safely represented.
- Steam library-folder selection and preflight disk-space UX.
- First-run install-script preparation surfaced as a launch-prep UI subflow.
- Steam window placement/focus/fullscreen enforcement.
- A private SteamClient IPC bridge spike, only after explicit legal/security/product review.

## Context & Research

### Relevant Code and Patterns

- `product/apps/portal/api/plugin-lifecycle/collect.rpc.ts` and `product/apps/portal/api/plugin-lifecycle/collect.rpc-handler.ts` are the closest typed provider API pattern: Portal API receives `providerId`, validates the plugin, then invokes a plugin operation via `runPluginHandler`.
- `product/apps/portal/api/plugin-diagnostics/collect.rpc-handler.ts` uses the same generic dispatch boundary and error mapping for plugin-owned evidence.
- `product/apps/portal/api/app-rpc-group.ts`, `product/apps/portal/api/handlers.ts`, and `product/apps/portal/api/server/rpc-server.ts` are the app RPC registration points that must include any new install RPC tags.
- `product/plugins/steam/src/plugin.ts` is the Steam first-party plugin descriptor. New install/status handlers belong in this descriptor with explicit capabilities.
- `product/plugins/steam/src/observability/log-observer.ts`, `log-tailer.ts`, `log-signals.ts`, `launch-state.ts`, `lifecycle-events.ts`, and `lifecycle-api.ts` provide the log-tail/reducer/API pattern to mirror for install state.
- `product/plugins/steam/nix/nixos-module.nix` owns `korri-steam-guest`, Steam service environment, and store-path discipline for generated shell scripts.
- `product/plugins/steam/nix/nixos-module.test.ts` reads the Nix module as text and should assert any new helper script uses Nix store paths rather than bare system binary paths.
- `product/plugins/steam/src/boundary.test.ts` enforces that generic code does not import `product/plugins/steam` internals; any new plugin-owned files should be registered there if the test enumerates plugin-owned Steam files.
- `product/apps/portal/features/home/library-rpc-layers.test.ts` shows real in-process RPC tests for renderer-side layers, not direct handler-only assertions.
- `product/themes/shift/pages/ShiftHomeReadyBody.tsx` is the current Shift launch surface. Install UI should fit beside launch affordances and retain spatial navigation conventions.

### Runtime Findings from the Bandai Spike

- Working install trigger:
  - `korri-steam-guest -console +app_install <appid>`
- Working uninstall trigger:
  - `korri-steam-guest -console +app_uninstall <appid>`
- Direct `steam://install/<appid>` through Steam runtime was unreliable on Bandai and should not be the primary v1 path.
- For 30XX (`1029210`), download state included `StateFlags 1026` while downloading and final `StateFlags 4` when installed.
- Steam manifests exposed useful fields including `BytesDownloaded`, `BytesToDownload`, `SizeOnDisk`, and `buildid`.
- Final installed state is proved by `steamapps/appmanifest_<appid>.acf` and game files under `steamapps/common/<Game>`.
- `content_log.txt` and related Steam logs are necessary evidence for request acknowledgement, failures, and queued/downloading transitions.

### Institutional Learnings

- `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`: concrete provider behavior belongs behind plugin seams; generic surfaces should be provider-keyed.
- `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md`: plugin conversions should remove conceptual coupling from generic platform/services/apps/themes/Nix layers.
- `docs/solutions/architecture-patterns/stream-control-command-outcome-contract-2026-06-03.md`: async trigger RPCs must distinguish accepted/requested from applied/completed.
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`: renderer code should consume proxied typed status surfaces rather than inventing daemon-specific direct polls.
- `docs/solutions/integration-issues/effect-v4-rpc-schema-class-responses-2026-05-03.md`: RPC handlers crossing the wire should return `Schema.Class` instances, not plain objects.
- `docs/solutions/integration-issues/effect-rpc-json-dates-need-decodable-schemas-2026-05-03.md`: use wire-decodable timestamp schemas for any date-like fields.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`: prefer real temp files, real process-spawn seams, and real in-process RPC servers over mock-heavy tests.

### External Research

External research already performed for the spike rejected SteamCMD, SteamKit, DepotDownloader, and private IPC as the default path for consumer app installs because they require credential custody, separate product semantics, or high maintenance/legal risk. This plan uses the already-authenticated local Steam client and filesystem/log observation instead.

## Key Technical Decisions

- **API shape:** add provider-generic RPCs under `product/apps/portal/api/plugin-install/`: `app.plugin.install.request` and `app.plugin.install.status`. They carry `providerId` plus app identity and dispatch to plugin handlers, matching the existing `app.plugin.lifecycle.collect` boundary.
- **Plugin operations:** add Steam plugin handlers for `install.request` and `install.status` with capabilities such as `install.request` and `install.status`. The generic handler never imports Steam code.
- **Shared state contract:** define one provider-neutral install state/schema in platform code, used by request responses, status responses, Steam snapshots, and UI state: `not-installed`, `requested`, `queued`, `downloading`, `installing`, `installed`, `failed`, and `unknown`. Request-only concepts such as `accepted`, `already-in-progress`, or `rejected` belong in a separate `outcome` field, not in the state enum.
- **Steam app identity:** v1 request/status payloads use Steam AppID as `appId`. The generic request handler authorizes that AppID against provider-neutral Korri catalog/library install metadata before dispatch; status can also be read with a matching request id from the ledger.
- **Installability metadata:** add a side-effect-free projection from readable config/library records to a provider-neutral optional install descriptor on playable/catalog entries, for example `{ providerId, appId, canRequestInstall }`. Steam fills this through plugin-contributed static/readable metadata, not through launch materialization; Shift consumes it rather than deriving AppIDs from Steam commands or importing Steam code.
- **Trigger path:** the Steam plugin triggers installs/updates with `korri-steam-guest -console +app_install <appid>` through a narrow plugin-owned command runner. The handler may return outcome `accepted`, `already-in-progress`, or `rejected`, but its state remains the shared install state and does not become `installed` unless status observation proves installed.
- **Helper path source:** the Nix module exports the helper path to Korrid/session runtime through an environment variable such as `KORRI_STEAM_APP_INSTALL_HELPER`; TypeScript accepts an injectable helper path for tests and defaults from that environment variable.
- **Capability and access guard:** the console command path is exposed as a Steam-plugin capability/config flag. Separately, install request/status RPCs require a concrete install-control session: the server verifies an HttpOnly, SameSite install-control cookie minted from a configured device secret/PIN, while non-browser tools may use the same authority via an authorization header. Feature gates remain rollout controls, not authorization. SteamCMD/SteamKit/private IPC remain absent.
- **Status authority:** install status is computed from Steam manifests/logs, primarily `libraryfolders.vdf`, `appmanifest_<appid>.acf`, and `content_log.txt`. The request runner is not the authority for completion.
- **Progress honesty:** byte progress is optional. If `BytesDownloaded` and `BytesToDownload` are available and parseable, expose them; otherwise Portal renders a coarse state label/indeterminate progress.
- **State persistence:** maintain a small plugin-owned request ledger keyed by `requestId` and `appId` so Portal retries and reloads can resolve a request to the current manifest/log state. The ledger stores no credentials.
- **Portal integration:** add a renderer-side install service/layer that calls the new RPCs. Shift UI shows install/update action and status for Steam entries only through provider metadata and typed status, not hardcoded plugin imports.
- **Launch lifecycle separation:** install status is separate from `app.plugin.lifecycle.collect`; launch lifecycle vocabulary remains launch-focused. Later server-status summaries may include compact install state, but this slice starts with explicit request/status RPCs.

## Implementation Units

### U1. Add typed provider-generic install request/status RPCs

**Goal:** Korrid exposes a typed, provider-keyed install API that can dispatch to Steam without generic code importing Steam internals.

**Requirements:** R1, R2, R4, R6, R9, R10, R11

**Files:**
- Add: `product/platform/library/install-state.ts`
- Add: `product/apps/portal/api/plugin-install/request.rpc.ts`
- Add: `product/apps/portal/api/plugin-install/request.rpc-handler.ts`
- Add: `product/apps/portal/api/plugin-install/request.rpc-handler.test.ts`
- Add: `product/apps/portal/api/plugin-install/status.rpc.ts`
- Add: `product/apps/portal/api/plugin-install/status.rpc-handler.ts`
- Add: `product/apps/portal/api/plugin-install/status.rpc-handler.test.ts`
- Add: `product/apps/portal/api/plugin-install/install-control-authorization.ts`
- Add: `product/apps/portal/api/plugin-install/install-control-authorization.test.ts`
- Add if needed: `product/apps/portal/api/plugin-install/session.ts`
- Modify: `product/apps/portal/api/app-rpc-group.ts`
- Modify: `product/apps/portal/api/handlers.ts`
- Modify: `product/apps/portal/api/server/rpc-group.ts`
- Modify: `product/apps/portal/api/server/rpc-server.ts`
- Modify: `product/apps/portal/api/server/rpc-server.test.ts`
- Modify: `product/apps/portal/api/hono-app.ts`
- Modify: `product/apps/portal/api/hono-app.test.ts`

**Approach:**
- Define a single shared `PluginInstallState` schema/type in `product/platform/library/install-state.ts`: `not-installed`, `requested`, `queued`, `downloading`, `installing`, `installed`, `failed`, and `unknown`; RPC and UI code import this platform schema/type.
- Define `RequestPluginInstallPayload` with `providerId`, `appId`, optional `playableId`, and optional `mode: "install" | "update"` defaulting to install/update-as-needed.
- Define `RequestPluginInstallResponse` as a `Schema.Class` with:
  - `providerId`
  - `appId`
  - `requestId`
  - `outcome: "accepted" | "already-installed" | "already-in-progress" | "rejected"`
  - `state: PluginInstallState`
  - optional `message`, `observedAt`, and provider evidence metadata.
- Define `PluginInstallStatusPayload` with `providerId`, `appId`, and optional `requestId`; no event replay fields in v1.
- Define `PluginInstallStatusResponse` with `state: PluginInstallState` plus optional progress:
  - `bytesDownloaded?: number`
  - `bytesToDownload?: number`
  - `percent?: number`
  - `providerEvidence?: Record<string, unknown>` for sanitized provider-owned fields such as Steam state flags/build id
  - `lastEvidenceAt?: string`
  - `nextActionHint: "wait" | "retry" | "inspect-diagnostics" | "none"`
- Use `ApiError` and map plugin failures to `ValidationError`, `NotFoundError`, or `DataError` at the handler boundary.
- Gate request/status RPCs with the concrete install-control session check: browser callers present an HttpOnly, SameSite install-control cookie minted from a configured device secret/PIN; tools may present an authorization header for the same authority. It must be enforced before plugin dispatch.
- Add the minimal session acquisition route in the Hono API layer: an operator submits the configured install PIN/secret to a dedicated install-control session endpoint, the server sets the HttpOnly/SameSite cookie, and JavaScript never receives the cookie value. Keep this route separate from feature gates.
- Register the request/status RPCs on both `appRpcGroup` and `serverRpcGroup` because deployed Korrid can serve the server RPC surface.
- For status, require install-control authorization plus either provider/app allowlist membership or a matching `requestId`/`appId` ledger entry so arbitrary AppID enumeration is not exposed.
- Before dispatching a request, authorize `providerId`/`appId` against provider-neutral install metadata from Korri's catalog/library surfaces; direct numeric AppIDs that are not allowlisted are rejected.
- Mirror `handleCollectPluginLifecycle`: validate provider id, verify enabled plugin, find the matching handler by operation/capability, call `runPluginHandler`, and wrap the plugin result in typed response classes.
- Return `Schema.Class` instances in handlers and cover at least one real in-process RPC roundtrip so transport serialization is tested.

**Test scenarios:**
- Unknown/malformed provider id returns `ValidationError` or `NotFoundError`.
- Disabled or missing plugin returns `NotFoundError`.
- Enabled plugin without install capability returns `NotFoundError`.
- Plugin handler success returns a typed response with the same provider/app/request id.
- Unauthorized request callers are rejected before any plugin spawn seam is reached.
- Unauthorized status callers cannot enumerate arbitrary provider/app status.
- Authorized status callers can read status by provider/app allowlist or by a matching `requestId`/`appId` ledger entry.
- Disabled install feature gate rejects request before any plugin spawn seam is reached.
- Numeric but non-allowlisted AppIDs are rejected before any plugin spawn seam is reached.
- Plugin failure is converted to `DataError` without leaking raw absolute paths.
- The app and server RPC groups accept both new RPC tags through in-process `withRpcServer` roundtrips.
- The Hono install-control session route sets an HttpOnly/SameSite cookie for a valid PIN and rejects invalid PINs without setting a cookie.

### U2. Build Steam install-state projection from manifests and logs

**Goal:** The Steam plugin can report conservative, evidence-backed install state for an AppID without relying on the trigger process outcome.

**Requirements:** R2, R3, R4, R8, R9

**Files:**
- Add: `product/plugins/steam/src/observability/install-state.ts`
- Add: `product/plugins/steam/src/observability/install-state.test.ts`
- Add: `product/plugins/steam/src/observability/install-api.ts`
- Add: `product/plugins/steam/src/observability/install-api.test.ts`
- Add or extend: `product/plugins/steam/src/observability/install-signals.ts`
- Add or extend: `product/plugins/steam/src/observability/install-signals.test.ts`
- Modify only if reused: `product/plugins/steam/src/observability/log-signals.ts`
- Modify only if reused: `product/plugins/steam/src/observability/log-observer.ts`
- Modify: `product/plugins/steam/src/boundary.test.ts`

**Approach:**
- Add a pure `SteamInstallSnapshot` model with phase/state, confidence, timestamps, progress fields, raw `stateFlags`, and sanitized evidence.
- Reuse or extract the existing Steam VDF parser from `product/plugins/steam/src/state-materializer.ts` for `libraryfolders.vdf` and `appmanifest_<appid>.acf`; add only install-specific projection helpers.
- Resolve candidate library folders from `libraryfolders.vdf`, falling back to `${steamHome}/steamapps` for the current Bandai layout.
- Map manifest/log evidence conservatively:
  - missing manifest + no recent request: `not-installed`
  - recent request and no manifest yet: `requested` or `queued`
  - appmanifest has parseable bytes with `BytesDownloaded < BytesToDownload`: `downloading`
  - content log says app state downloading/preallocating/committing: `downloading` or `installing`
  - `StateFlags` indicates fully installed and byte totals are complete: `installed`
  - known error lines or failed request evidence: `failed`
  - contradictory/partial evidence: `unknown`
- Preserve raw fields (`stateFlags`, `buildId`, `sizeOnDisk`) for diagnostics, but expose sanitized display messages.
- Keep v1 status as current-snapshot polling keyed by provider/app/request; defer event replay/cursors until a real consumer appears.
- Avoid tying install state to launch lifecycle reducers; share log-tail primitives if useful, but keep the install state vocabulary separate.

**Test scenarios:**
- No manifest and no request returns `not-installed`.
- Recent request with no manifest returns `requested`/`queued`.
- 30XX-like manifest with `StateFlags 1026`, `BytesDownloaded < BytesToDownload`, and `BytesToDownload 703759968` returns `downloading` with percent.
- Final manifest with `StateFlags 4`, complete bytes, `SizeOnDisk`, and `buildid` returns `installed`.
- Content-log install/error lines can move state to `installing` or `failed`.
- Corrupt manifest returns `unknown`, not a thrown defect.
- Sanitization removes absolute Steam paths from API-facing messages.

### U3. Add a Steam plugin install trigger and request ledger

**Goal:** The Steam plugin can accept install/update requests, invoke the local logged-in Steam client, deduplicate retries, and expose status correlated to request identity.

**Requirements:** R1, R2, R4, R6, R7, R9, R11

**Files:**
- Add: `product/plugins/steam/src/app-control/install-trigger.ts`
- Add: `product/plugins/steam/src/app-control/install-trigger.test.ts`
- Add: `product/plugins/steam/src/app-control/install-request-ledger.ts`
- Add: `product/plugins/steam/src/app-control/install-request-ledger.test.ts`
- Modify: `product/plugins/steam/src/plugin.ts`
- Modify: `product/plugins/steam/src/plugin.test.ts`
- Modify: `product/plugins/steam/src/boundary.test.ts`

**Approach:**
- Implement a plugin-owned command runner that spawns the configured install helper with an AppID and captures exit status/stdout/stderr tail for diagnostics.
- Resolve the helper path from an injectable test seam first, then from `KORRI_STEAM_APP_INSTALL_HELPER`; fail with a typed unavailable result when the helper path is absent.
- Default command path should be the Nix-provided `korri-steam-app-install` helper from U4, which wraps `korri-steam-guest -console +app_install <appid>`.
- Validate `appId` as a non-empty numeric Steam AppID before any catalog lookup or spawn.
- Treat request-dispatch authorization as owned by U1's provider-neutral handler. In the Steam plugin, re-check local installed-manifest status for update/status paths and reject direct trigger inputs that arrive without an authorization marker from the handler/test seam.
- Before spawning, collect current status; if already `installed`, return outcome `already-installed` with state `installed` and the current manifest fields.
- Deduplicate in-flight requests by `appId` and mode for a short TTL so double taps and RPC retries return the same `requestId`/state.
- Record request ledger entries under Steam plugin state (for example a small JSON file under the Steam/Korri state root) with request id, app id, mode, requestedAt, trigger status, and last error. Do not store credentials or raw unredacted logs.
- Treat command exit 0 as outcome `accepted` with state `requested`, not completion. Treat command spawn failure as outcome `rejected` or state `failed` with a sanitized message.
- Expose plugin handlers in `steamPlugin.contributes.handlers` for `install.request` and `install.status`.

**Test scenarios:**
- Numeric AppID validation rejects invalid input before spawn.
- Numeric but unauthorized AppIDs are rejected before spawn.
- Already-installed manifest short-circuits without spawning and returns outcome `already-installed` with state `installed`.
- A successful fake helper spawn returns outcome `accepted`, state `requested`, and a stable `requestId`.
- A repeated request for the same AppID returns the in-flight request rather than spawning again.
- Non-zero helper exit returns `failed` with sanitized stderr tail.
- Status after a request merges ledger information with manifest/log observation.
- Steam plugin descriptor advertises the install request/status capabilities.

### U4. Add Nix-owned local Steam install helper

**Goal:** The device image exposes a narrow helper that runs the proven local-client console install command in the correct Steam runtime environment.

**Requirements:** R1, R6, R7

**Files:**
- Modify: `product/plugins/steam/nix/nixos-module.nix`
- Modify: `product/plugins/steam/nix/nixos-module.test.ts`

**Approach:**
- Add a `pkgs.writeShellScriptBin` helper such as `korri-steam-app-install` that validates one numeric AppID argument and invokes:
  - `korri-steam-guest -console +app_install "$appid"`
- Use only Nix-store-qualified utilities and existing Steam runtime environment variables from the module.
- Export the resulting helper path to the Korrid/session runtime as `KORRI_STEAM_APP_INSTALL_HELPER` so the TypeScript plugin does not guess via `PATH`.
- If the helper needs to start or require the Steam service, reuse the narrow existing service-control pattern rather than adding broad sudo rights.
- Prefer non-blocking trigger behavior: return once Steam accepts/forwards the command; completion is observed by U2 status.
- Make any experimental/undocumented nature explicit in module comments and plugin capability naming, while keeping credentials out of scope.
- Do not add an uninstall helper in this slice; uninstall is deferred as a separate destructive-action feature.

**Test scenarios:**
- Module text includes `korri-steam-app-install` and the `-console +app_install` invocation.
- Module text exports `KORRI_STEAM_APP_INSTALL_HELPER` to the Korrid/session runtime.
- Helper validates AppID and rejects empty/non-numeric values.
- Helper uses Nix store paths for shell utilities; no bare system binary paths are introduced.
- Existing Steam module checks still pass on aarch64-only assumptions.

### U5. Add renderer/Portal install service layer and Shift UI states

**Goal:** Portal can request and monitor Steam app installs remotely using typed RPCs, with an honest UI that does not overclaim progress.

**Requirements:** R1, R3, R5, R8, R9, R11

**Files:**
- Add: `product/apps/portal/features/home/plugin-install-rpc-layer.ts`
- Add: `product/apps/portal/features/home/plugin-install-rpc-layer.test.ts`
- Add or modify: `product/platform/library/playable-library.ts`
- Add or modify: `product/platform/catalog/catalog-facts-source.ts`
- Add: `product/platform/library/config/app-install-metadata.ts`
- Add: `product/platform/library/config/app-install-metadata.test.ts`
- Modify: `product/platform/library/proseql/library-repository.ts`
- Add: `product/platform/react/library/install-atoms.ts`
- Modify: `product/apps/portal/features/home/library-rpc-layers.test.ts`
- Modify: `product/apps/portal/features/home/HomeRuntimeLayersRoot.tsx`
- Modify: `product/themes/shift/pages/ShiftHomeReadyBody.tsx`
- Modify: `product/themes/shift/pages/ShiftHomeReadyBody.test.tsx`
- Add if needed: `product/themes/shift/molecules/ShiftInstallControlUnlock.tsx`
- Add if needed: `product/themes/shift/molecules/ShiftInstallControlUnlock.test.tsx`
- Add if needed: `product/themes/shift/molecules/ShiftInstallStatusNotice.tsx`
- Add if needed: `product/themes/shift/molecules/ShiftInstallStatusNotice.test.tsx`

**Approach:**
- Add a platform-level provider-neutral install state ADT for UI consumption, separate from Steam-specific raw manifest fields.
- Add an Effect layer backed by `RpcClient.make(appRpcGroup)` for `app.plugin.install.request` and `app.plugin.install.status`; browser requests rely on the HttpOnly install-control cookie, not a JavaScript-readable token.
- Add a minimal Portal unlock flow for remote install actions: when install-control is unavailable, prompt for the configured PIN/secret, call the install-control session route, then retry the request once the cookie is set.
- Add an atom/controller that:
  - requests install on confirm;
  - polls status while a request is active;
  - resumes status from `requestId`/`appId` on page re-entry where possible;
  - handles unknown/failed states without treating transport close as install failure.
- Add the smallest provider-neutral install descriptor to the playable/catalog entry shape, for example `install: { providerId: string; appId: string; canRequestInstall: boolean }`.
- Populate that descriptor through a side-effect-free projection from readable app/release config: generic code reads provider-qualified metadata and app choices, while Steam owns the static metadata shape it contributes. Do not run launch materializers during catalog/list rendering just to discover installability.
- Use that install descriptor to show install actions only for entries whose provider advertises requestable installs. Do not derive AppIDs from Steam command strings in UI code.
- Render install/update affordances near the selected Shift library item. In v1, display coarse states: Not installed, Requesting, Queued, Downloading, Installing, Installed, Failed, Unknown.
- If bytes are present, show percentage; otherwise render an indeterminate spinner and state label. Do not show MB/s or ETA.
- Do not render a functional cancel button for Steam v1.
- Preserve spatial-navigation conventions: native buttons, semantic input actions, and no component-level navigation library imports.

**Test scenarios:**
- RPC layer sends provider/app/request payloads to the server and decodes typed responses.
- Install controller transitions from idle/requesting to requested/downloading/installed/failed based on status responses.
- Steam readable/config projection attaches provider-neutral install metadata for a Steam AppID, and non-Steam projections leave it absent.
- Library repository/catalog conversion preserves provider-neutral install metadata without importing Steam in generic UI code.
- Shift renders an install/update action for an entry with install metadata and does not render it for entries without install capability metadata.
- Shift shows indeterminate progress when byte fields are absent.
- Shift shows a percentage only when byte totals are available and valid.
- Failed status shows retry/diagnostic copy without leaking raw absolute paths.
- Existing launch flow and foreground-session gate tests continue to pass.

### U6. Validate end-to-end on Bandai and document operational guardrails in tests/comments

**Goal:** Prove the new request/status path on the target device and leave clear guardrails for maintainers without creating broad documentation churn.

**Requirements:** R1, R3, R4, R5, R6, R7, R8

**Files:**
- Modify only if needed: `product/plugins/steam/src/observability/install-state.test.ts`
- Modify only if needed: `product/plugins/steam/src/app-control/install-trigger.test.ts`
- No broad docs expected unless implementation uncovers a new reusable solution that the user asks to capture.

**Approach:**
- After targeted tests pass, deploy to Bandai with the normal Nix rebuild path.
- Use a small already-owned app for validation when possible. Candidate AppIDs from the spike: VVVVVV (`70300`), FEZ (`224760`), 30XX (`1029210`). Prefer an app where uninstall/reinstall is acceptable to the operator.
- Validate the RPC path by requesting an install and polling status through the Bandai Korrid RPC endpoint.
- Confirm status transitions through at least `requested` and either `downloading` or `installed` based on manifest/log evidence.
- Confirm no Steam credentials were added to Korri config/state.
- Confirm Portal displays an honest coarse state and launch remains through `app.library.launch` after install.

**Test/validation scenarios:**
- RPC request returns quickly with a request id.
- Status polling finds manifest/log evidence and eventually reports `installed` for the test AppID.
- `appmanifest_<appid>.acf` fields align with API progress fields.
- Trigger failure or invalid AppID returns a typed error/failure state.
- Existing `app.server.status` provider lifecycle remains focused on foreground launch lifecycle.

## Verification Plan

Targeted unit/integration tests:

```bash
bun test \
  product/apps/portal/api/plugin-install/install-control-authorization.test.ts \
  product/apps/portal/api/plugin-install/request.rpc-handler.test.ts \
  product/apps/portal/api/plugin-install/status.rpc-handler.test.ts \
  product/apps/portal/api/hono-app.test.ts \
  product/apps/portal/api/server/rpc-server.test.ts \
  product/platform/library/config/app-install-metadata.test.ts \
  product/plugins/steam/src/observability/install-state.test.ts \
  product/plugins/steam/src/observability/install-api.test.ts \
  product/plugins/steam/src/observability/install-signals.test.ts \
  product/plugins/steam/src/app-control/install-trigger.test.ts \
  product/plugins/steam/src/app-control/install-request-ledger.test.ts \
  product/plugins/steam/src/plugin.test.ts \
  product/plugins/steam/src/boundary.test.ts \
  product/plugins/steam/nix/nixos-module.test.ts \
  product/apps/portal/features/home/plugin-install-rpc-layer.test.ts \
  product/apps/portal/features/home/library-rpc-layers.test.ts \
  product/themes/shift/pages/ShiftHomeReadyBody.test.tsx
```

Nix/module regression if Nix helper changes land:

```bash
nix build .#checks.x86_64-linux.korri-sm8550-kiosk-config --no-link
```

On-device validation after deployment:

```bash
# Through the typed RPC path, request install for a known owned app.
# Then poll app.plugin.install.status until it reports installed or failed.
```

Known baseline caveats: whole-repo `just typecheck`, `just test-unit`, and `just lint` may be red on unrelated existing issues noted in prior work. Use the targeted tests plus Bandai validation as the primary gate unless implementation touches broader surfaces.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Steam console command behavior changes across client releases | Keep it behind a Steam plugin capability/config guard; status remains evidence-based, and failures surface as typed `failed`/`unknown` states. |
| Generic code starts importing Steam internals | Use provider-generic RPCs, `runPluginHandler`, and `product/plugins/steam/src/boundary.test.ts`. |
| Trigger ACK is mistaken for completion | Response/state vocabulary distinguishes `requested` from `installed`; tests assert command exit 0 does not mean installed. |
| Portal displays fake precision | Byte/percent fields are optional; UI falls back to indeterminate coarse state. |
| Unauthenticated or unintended callers trigger downloads | Enforce install-control authorization before request/status dispatch and reject non-allowlisted AppIDs before plugin dispatch. |
| Duplicate Portal requests spawn duplicate commands | Request ledger deduplicates by AppID/mode TTL and returns the same request id for retries. |
| Manifest parsing breaks on corrupt/partial files | Parser returns `unknown` with sanitized evidence instead of throwing defects across the API boundary. |
| Steam shows a UI prompt despite the remote request | Surface `unknown`/`blocked`-style display copy and defer library-folder/prompt handling to follow-up; do not hide the uncertainty. |
| Raw logs leak local paths over the LAN RPC API | Reuse/specialize Steam evidence sanitization before returning messages/evidence. |
| Long downloads make polling look stale | Status uses manifest/log timestamps and current snapshots; the UI treats transport errors separately from domain failure. |
| Installing while a game is running has ambiguous Steam behavior | V1 does not preempt or coordinate with sessiond. Same-AppID launch during install should be blocked or warned by UI if status is not installed; different-AppID downloads are best-effort through Steam's own queue. |

## Outstanding Questions

### Resolved During Planning

- **Should Korrid store Steam credentials or run a separate downloader?** No. Use the logged-in local Steam client and observe Steam-owned state.
- **What is the v1 trigger path on Bandai?** `korri-steam-guest -console +app_install <appid>` via a plugin/Nix-owned helper.
- **Should the API be Steam-specific or provider-generic?** Provider-generic typed RPCs (`app.plugin.install.request/status`) preserve plugin boundaries while Steam owns the implementation.
- **Should trigger response block until complete?** No. It returns request acknowledgement; status polling proves completion.
- **Can Portal show exact speed/ETA?** Not in v1 unless the observer has explicit evidence. Coarse/indeterminate state is the honest default.
- **How does Shift know an AppID is installable?** Through a provider-neutral install descriptor on playable/catalog entries, not by parsing Steam commands.
- **How does TypeScript find the helper?** The Nix module exports `KORRI_STEAM_APP_INSTALL_HELPER`; tests inject the path explicitly.

### Deferred to Implementation

- [Affects U1/U3][Technical] Exact `requestId` generation/storage lifetime for current-snapshot status polling.
- [Affects U2][Technical] Exact mapping from all Steam `StateFlags` bit combinations to install state; start conservative and preserve raw flags for diagnostics.
- [Affects U3/U4][Technical] Whether the helper should start Steam if the service is not already warm, or return `SteamClientUnavailable` and rely on `keepWarm` posture.
- [Affects U5][UX] Whether install/update affordance belongs directly on selected tile confirm flow, options/menu action, or a detail panel in the current Shift IA.

