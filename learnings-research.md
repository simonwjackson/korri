# Institutional Learnings Search Results

## Search Context

- **Feature/Task**: Korri config graph migration from library root to ProseQL documentGraph; KORRID config watching/events; Nix module runtime paths; rootless `/var/lib/korri` state; Bandai deployment.
- **Keywords Used**: `proseql`, `documentGraph`, `library-root`, `config-graph`, `KORRID`, `config-watch`, `events`, `nixos-module`, `runtime-path`, `tmpfiles`, `rootless`, `var/lib/korri`, `storage/korri`, `serviceMode`, `rocknix`, `nix-on-rocks`, `deploy`, `bandai`, `cascade-policy`, `aarch64-bundle`
- **Files Scanned**: 47 total files across 9 subdirectories
- **Relevant Matches**: 6 files (strong or moderate relevance)

---

### Critical Patterns

`docs/solutions/patterns/critical-patterns.md` does not exist in this repo.

---

### Relevant Learnings

#### 1. ProseQL library YAML should use canonical storage with key-derived IDs

- **File**: `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md`
- **Module**: `korri/shared/library/proseql` + `tools/importers/rocknix`
- **Problem Type**: `best_practice`
- **Severity**: medium
- **Relevance**: This is the foundational decision for migrating the config graph to ProseQL `documentGraph`. It defines the canonical storage shape, the persistence payload vs. runtime contract split, the importer-only role of ROCKNIX, and the on-disk path convention (`/storage/korri/library`).

**Key Insight**:
ProseQL is the **single canonical runtime store**; external sources (ROCKNIX, etc.) are snapshot importers only and must never be on the live read path. The established flow is:

```
external source → importer → ProseQL YAML → LibrarySource → RPC/UI/Launcher
```

When migrating to `documentGraph`, carry this boundary forward:

1. **Separate persistence payload schema from the runtime contract.** The `GamePayloadRecord` stored in YAML omits `id`; the repository layer hydrates `id` from the YAML object key via `{ kind: "derivedFromKey", field: "id" }` in `makeKorriLibraryDbConfig`. A `documentGraph` config equivalent should follow the same split — config payload on disk, full config record (with computed identity) in the runtime contract.

2. **Importers fail fast when the target is not empty.** The ROCKNIX importer guards against partial-overwrite state corruption:
   ```ts
   if (existingGames.length > 0) throw new Error("reset target library before re-importing")
   ```
   Any migration path for config documents should adopt the same all-or-nothing posture rather than silently merging a partial import over live data.

3. **ProseQL stays server-side.** Renderer/portal code touches config only through RPC and atoms — never imports ProseQL directly. This boundary must hold if `documentGraph` becomes the backing store for KORRID config.

4. **`@proseql/node@0.12.0`** is the minimum version that supports `id: { kind: "derivedFromKey" }`. Earlier versions produce duplicated id fields in YAML.

5. **Validated on Bandai (Thor/Sobo hardware).** The seam was proven live by re-importing ROCKNIX into `/storage/korri/library`, restarting the supervised session, and running `just check-odin-sessiond`. Use this as the template for validating the documentGraph migration on Bandai.

---

#### 2. Boot-scoped NixOS control plane with session-scoped runner via shared private runtime dir

- **File**: `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`
- **Module**: `nix/modules/korri-server`
- **Problem Type**: `architecture_pattern`
- **Severity**: medium
- **Relevance**: Directly addresses Nix module runtime paths and rootless `/var/lib/korri` state. The pattern was developed because `%t` resolves differently under system vs. user managers, `%h` silently becomes `/root` in system mode, and non-root processes cannot create siblings of `/run/user`. These exact failure modes will recur when wiring KORRID config-watch paths in a NixOS module.

**Key Insight**:

Declare a single `serviceMode` option (`"user"` | `"system"`) and **derive every path from it**. Do not hardcode `/var/lib/korri` or `/run/korri` in host configs; let the module produce safe defaults per mode.

```nix
# serviceMode = "system" → /run/korri-game-stream  (absolute, tmpfiles-managed)
# serviceMode = "user"   → %t/korri-game-stream    (%t safe only in user manager)
runtimeDir = if isSystemMode then "/run/${runtimeDirName}" else "%t/${runtimeDirName}";
```

Critical rules for the rootless path:

- **`ProtectHome = "read-only"` + `ProtectSystem = "strict"`** on the system unit. `/var/lib/korri` or a custom `StateDirectory` is the right home for durable state; `/run/<name>` for ephemeral runtime files. `RuntimeDirectoryPreserve = "yes"` keeps pending config state alive across restarts.
- **`tmpfiles.settings`** must own boot-time directory creation for `/run/<name>` — a non-root `ExecStartPre` cannot `install -d` a top-level `/run/` sibling.
- **Fail at `nix eval`, not at boot.** Add assertions for every combination that would silently corrupt paths:
  ```nix
  { assertion = !isSystemMode || !(hasPlaceholder runtimeDir);
    message = ''runtimeDir uses %t or %h — invalid in system mode''; }
  ```
- **`%h` is `/root` in system mode.** Derive `library.root` (and by extension any `configRoot`) from `config.users.users.${cfg.user}.home`, not from `%h`.
- **The session runner needs the absolute path injected.** KORRID config-watch paths known to the system unit are unreachable via systemd metadata from a Sunshine/greetd/logind-spawned child. Pass them through explicit env vars (`KORRI_CONFIG_ROOT`, etc.) in the wrapper so the runtime and the Nix module agree on the same path.

Tests for this pattern run real `nix eval` against the module (not mocks): `tools/testing/nix/korri-server-module-eval.test.ts`. Add analogous eval tests for any KORRID config module options that derive filesystem paths.

---

#### 3. Architectural posture belongs in the image-level default, not the module-level default

- **File**: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- **Module**: `nix/images` + `nix/modules`
- **Problem Type**: `architecture_pattern`
- **Severity**: medium
- **Relevance**: When the config graph migration introduces new Nix module options for KORRID config paths, watch mode, or documentGraph root, this pattern determines where to set the defaults that are correct for the Bandai/SM8550 image vs. what should be conservative at the bare module level.

**Key Insight**:

The module default encodes "safest fallback for any consumer." The image default encodes "this is the deal when you build this image." Put the Bandai-correct defaults (`documentGraph.root`, `configWatchEnabled`, any path that assumes `/var/lib/korri`) at the **image layer** (`nix/images/headless.nix` or the SM8550 image), not at the module layer.

```nix
# Module keeps conservative defaults — no assumptions about /var/lib/korri
services.korri.config.documentGraphRoot = lib.mkDefault null; # derive from user home

# Image asserts the fleet-wide posture
# nix/images/headless.nix (or korri-sm8550.nix):
services.korri.config.documentGraphRoot = lib.mkDefault "/var/lib/korri/config";
```

The historical failure was Sobo coming up bound to `127.0.0.1` with federation disabled because the module defaults were still calibrated for a laptop. Any new KORRID option with a deployment-specific correct value carries the same risk. Fix it at the image layer; don't silently regress when a new device imports the module.

Corresponding `nix check` assertions should live at the image-eval level:
```nix
(check "SM8550 image must have documentGraphRoot configured" (
  sm8550Summary.korridConfigRoot != null
))
```

---

#### 4. ROCKNIX nix-on-rocks deploys target the guest store; the host has no /nix

- **File**: `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`
- **Module**: `tools/scripts/deploy-sobo` + `nix-on-rocks`
- **Problem Type**: `workflow_issue`
- **Severity**: **high**
- **Relevance**: The Bandai deployment uses nix-on-rocks with a ROCKNIX host (port 22) and a NixOS guest (port 2222). These two foot-guns cost real deploy time in the past and will recur if deploy scripts for the config graph migration are written without internalizing the two-store topology.

**Key Insight**:

Two hard rules with no exceptions:

1. **Never `nix copy --to ssh-ng://root@${DEVICE_HOST}` (port 22, the host).** The ROCKNIX host has no usable `/nix/store`. The toplevel only needs to reach the guest via `nixos-rebuild --target-host root@sobo` (port 2222 / alias). The rocknix helpers (`rocknix-guest-generation-import`, `rocknix-guest-generation-switch`) `nsenter` into the guest namespace to read paths from the guest store.

2. **Always `readlink -f` when resolving `/nix/var/nix/profiles/system`.** Bare `readlink` returns the relative `system-NNN-link` target, which breaks every subsequent `nix copy`/`nsenter`/`rocknix-guest-generation-*` step that expects an absolute store path.

Correct five-step sequence:
```bash
# 1. Build on builder, push closure into the GUEST store
nixos-rebuild boot --flake .#korri-sm8550 --build-host ${BUILDER} --target-host root@bandai ...

# 2. Resolve absolute toplevel ON THE GUEST (-f is required)
toplevel="$(ssh -F ssh_config bandai 'readlink -f /nix/var/nix/profiles/system')"

# 3. Host-side helpers nsenter into guest — never copy to host
ssh root@${BANDAI_HOST_IP} bash -s "${toplevel}" <<'EOF'
  rocknix-guest-generation-import --system "$1" --source config-graph-migration
  rocknix-guest-generation-switch --to "$1" --no-restart
EOF

# 4. Warm-restart to activate
ssh root@${BANDAI_HOST_IP} 'systemctl restart rocknix-guest.service'
```

---

#### 5. Shipping the KORRI API server to aarch64 via Bun single-file bundle

- **File**: `docs/solutions/best-practices/korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27.md`
- **Module**: `api-server`
- **Problem Type**: `best_practice`
- **Severity**: medium
- **Relevance**: If the ProseQL `documentGraph` migration changes the `@app/api/hono-app` import graph (adding new ProseQL collections, a config-watch pathway, or new KORRID services), the Bun single-file bundle for Bandai must be re-validated. This learning documents the exact bundler pitfalls that will resurface.

**Key Insight**:

Three mandatory `--external` flags for any bundle that includes `@proseql/core`:

| Flag | Reason |
|---|---|
| `--external jsonc-parser` | `@proseql/core` has a default-import on a package whose ESM build has no default export. Bun hard-fails without this. |
| `--external pino-pretty` | Pulls in `thread-stream` worker path resolution that embeds build-host absolute paths. |
| `--external thread-stream` | Same: absolute path to `worker.js` is embedded at module-init time; crashes on device with `ModuleNotFound`. |

And `--define process.env.NODE_ENV='"production"'` must be present to DCE the dev-only logger branch, otherwise the pino-pretty import survives tree-shaking.

After any dep change that touches ProseQL, pino, or thread-stream: **re-validate the externals list** before shipping to Bandai. The failure mode is a clean `ModuleNotFound` crash on startup, not a build error.

Runtime budget on aarch64 with the full KORRI stack including ProseQL: **~99 MB RSS** at idle. Adding `documentGraph`-backed config watchers or additional ProseQL collections will grow this — measure it before deploying to Bandai where the ceiling is ~970 MB shared with the compositor and portal renderer.

---

#### 6. Prefer explicit cascade-folded policy fields over wrapper-side sniffing heuristics

- **File**: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- **Module**: `korri/shared/library/config` + `tools/device/game-stream-fullscreen`
- **Problem Type**: `design_pattern`
- **Severity**: medium
- **Relevance**: The KORRID config watching/events design will face this choice: detect config changes by sniffing filesystem signals heuristically (inotify rename vs. write, partial-write races) or by driving events through an explicit intent — a `ConfigChanged { path, kind, version }` event type that is named in the cascade and emitted by the writer, not inferred by the watcher. This pattern has bitten three separate Korri subsystems and the team has explicitly named it as a recurring trap.

**Key Insight**:

The same anti-pattern that caused silent `exposeWayland` failures in gamescope, silent `source` inference failures in the input bus, and silent focus-style failures in Electrobun will occur in config watching if the watcher infers intent from filesystem event shape rather than receiving an explicit typed event from the writer:

> **A heuristic watching filesystem events cannot see the writer's intent. The writer knows what changed and why; encode that in the event.**

Applied to KORRID config watching:

- **The writer emits a typed event** (`ConfigDocumentUpdated { documentId, kind: "full-replace" | "field-patch", version }`) at the point it knows what changed. The watcher consumes the typed event; it does not re-derive `kind` from inotify flags.
- **The event cascades through the same fold** as any other config-layer change. A `documentGraph` update to a game entry is a config-layer event at the `game` level; it should merge through the cascade resolver exactly as a YAML edit would, not bypass the fold via a direct-notification side-channel.
- **Defaults at the floor of the cascade encode the correct-for-production behavior.** A watcher that has no opinion on a config field should receive the default from the cascade, not produce an empty/null observation.
- **Delete old file-stat heuristics when explicit events land.** Leaving both creates two parallel channels that can disagree; the loser is silent.

---

### Recommendations

**Config graph migration to ProseQL documentGraph**

1. Follow the `makeKorriLibraryDbConfig` pattern: define a `documentGraph` config schema that separates the persistence payload (what is written to YAML) from the runtime config record (what `LibrarySource`, RPC, and UI see). Hydrate computed identity (document ID, resolved paths) from the YAML key at read time.
2. Keep ProseQL server-side. The renderer touches config only through the existing RPC + atom layers. If `documentGraph` needs to be exposed to themes, expose it as a new RPC group, not as a direct ProseQL import.
3. Validate the migration on Bandai with a real import + session restart cycle (mirror the `just check-odin-sessiond` pattern).

**KORRID config watching/events**

4. Make change events explicit and typed at the writer, not inferred at the watcher. Use an `Effect` `Queue` or `PubSub` carrying `ConfigDocumentUpdated` with an explicit `kind` field — not `chokidar` raw event shape or inotify flags. The watcher receives the typed event; it does not re-derive intent from filesystem signals.
5. Route config-watch events through the cascade resolver so per-document and per-deployment overrides merge correctly rather than bypassing the fold.

**Nix module runtime paths + rootless `/var/lib/korri`**

6. Add a `serviceMode` seam (or reuse the existing one) in any NixOS module that wires KORRID paths. Derive `configRoot`, `documentGraphRoot`, and watcher socket paths from the mode; do not hardcode them in host configs.
7. Use `systemd.tmpfiles.settings` for boot-time directory ownership and `RuntimeDirectoryPreserve = "yes"` for files that must survive unit restarts. Add NixOS `assertions` that reject `%t`/`%h` placeholders in system-mode paths at eval time.
8. Push the SM8550/Bandai-correct `documentGraphRoot` default into the image layer (`nix/images/headless.nix` or the SM8550 image), not into the module default. Add image-eval assertions to prove the path is set before shipping.

**Bandai deployment**

9. Use `readlink -f` (not bare `readlink`) when resolving the guest toplevel. Never `nix copy` to the ROCKNIX host store (port 22). Use the five-step sequence: `nixos-rebuild --target-host` to push the closure into the guest, then `rocknix-guest-generation-import` + `rocknix-guest-generation-switch` via the host, then `systemctl restart rocknix-guest.service`.
10. After any dependency change that touches `@proseql/core`, pino, or thread-stream, re-validate the Bun bundle `--external` flags before deploying the updated API to Bandai. Check RSS under load — the ProseQL documentGraph additions will grow the memory footprint beyond the baseline 99 MB.
