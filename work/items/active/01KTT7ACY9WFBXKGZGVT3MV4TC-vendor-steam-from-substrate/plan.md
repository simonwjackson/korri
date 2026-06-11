---
title: "refactor: Vendor Steam ARM64 from nix-on-rocks into product/vendor with korri-owned module"
type: refactor
status: completed
date: 2026-06-10
verify_command: "just test-nix && just sm8550-kiosk-toplevel-check"
---

# refactor: Vendor Steam ARM64 from nix-on-rocks into product/vendor with korri-owned module

## Summary

Move the Steam ARM64 guest-native package from the nix-on-rocks substrate into `product/vendor/steam-korri/` (with the bandai smoke fixes baked in), port the guest adapter module to `product/systems/nixos/modules/korri-steam.nix` under the `services.korri.steam.*` namespace on `/var/lib/korri` paths, and remove Steam from nix-on-rocks entirely — a hard break sequenced by the `flake.lock` bump, with no transitional `disabledModules` shim.

---

## Problem Frame

Steam on the SM8550 guest is currently owned by the substrate (`nix-on-rocks`): the package comes from `substratePackages.steam` and the adapter module rides in via `rocknix-guest-base`. The 2026-06-10 bandai bring-up proved the package works but surfaced fixes (missing `taskset` in the FHS capsule, seed unzip backslash-path bug, bwrap cwd trap, fd-limit launch failure) that belong to Korri's product layer, not a neutral substrate. The substrate boundary refactor direction (see `docs/solutions/`) is that Korri owns product payloads; additionally `/storage` is deprecated on the device in favor of the korri-runtime state layout.

---

## Requirements

- R1. The Steam package builds from `product/vendor/steam-korri/` with no reference to the nix-on-rocks flake input
- R2. The vendored package includes the smoke fixes: `util-linux` (taskset) in the FHS capsule, seed handles backslash-path zip entries, run capsule cds to `STEAM_HOME` before exec
- R3. A korri-owned NixOS module (`services.korri.steam.*`) replaces the substrate's `rocknix.steam.*` module with defaults under `/var/lib/korri` / `/home/korri` (no `/storage` paths)
- R4. The module ships a launch path that survives the known failure modes: fd limit (`LimitNOFILE`), working directory, session env
- R5. The SM8550 image composes Steam exclusively through the korri module and overlay package — `substratePackages.steam` is gone
- R6. nix-on-rocks no longer ships Steam: package, module, base-profile import, and its steam tests are removed; its flake surface contract passes
- R7. Korri's `flake.lock` points at the post-removal nix-on-rocks rev, and the full Nix check suite passes
- R8. Package and module contracts are covered by Nix checks (colocated package check, sm8550 config check assertions, owner-matrix registration)

---

## Scope Boundaries

- No first-run automation (seed-as-user orchestration, two-phase self-update, Proton ARM64 auto-install) — backlog `01KTT615NE…`
- No gamescope DRM session integration or sluggishness work — backlog `01KTT615NF…`
- No FEX rootfs seeding, no 30XX crash debugging — backlogged separately
- No changes to other nix-on-rocks surfaces (inputplumber, cemu, moonlight, device profiles)
- No migration tooling for existing seeded state under `/storage` on bandai — state is abandoned; fresh seed after deploy
- No renaming of the package's internal script vocabulary beyond the launcher (see Key Technical Decisions) — `steam-arm64-seed` etc. keep their names to limit churn

### Deferred to Follow-Up Work

- First-run seeding/self-update/Proton install flow: backlog `01KTT615NE…`, builds on this plan's module
- Korri-session/gamescope launch integration: backlog `01KTT615NF…`

---

## Context & Research

### Relevant Code and Patterns

- Vendor package shape: `product/vendor/libretro-fake-08/package.nix`, `product/vendor/gamescope-korri/package.nix` — callPackage-compatible function, exact deps, `passthru` contract, `nix-support` provenance manifest
- Overlay registration: `product/systems/nixos/overlays/korri-packages.nix` — additive packages get their own attr; substitution packages also shadow the upstream name. Steam must NOT shadow `pkgs.steam` (`product/systems/nixos/images/desktop-lab.nix` uses nixpkgs steam on x86)
- Package exposure: `product/systems/nixos/flake/packages.nix` (e.g., `libretro-fake-08` at line ~56)
- Module conventions: `product/systems/nixos/modules/korri-runtime.nix` (option namespace `services.korri.*`, `hasPrefix` path assertions), `korri-removable-media.nix` (opt-in module, not part of the daemon aggregate), aggregates in `product/systems/nixos/flake/modules.nix`
- Check conventions: colocated `product/vendor/<pkg>/check.nix` imported by `product/systems/nixos/flake/checks.nix` (`libretro-fake-08-check` at line ~163), registered in the `korri-standard-native` `ownerMatrix` (line ~315); composed-system assertions in `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Platform adapter: `product/systems/nixos/images/platforms/rocknix-sm8550.nix` — `substratePackages.steam` at line ~561, `nix-on-rocks.nixosModules.rocknix-guest-base` import at line ~365
- Upstream source to vendor (target repo `nix-on-rocks`, sibling checkout `../nix-on-rocks`): `packages/steam/{package.nix,manifest.nix,scripts/,resources/}`, `guest/modules/steam.nix`, base-profile import at `guest/profiles/rocknix-guest-base.nix:100`, tests `nix/tests/steam-package-output-contract.nix` and `nix/tests/flake-surface-contract.nix`, `guest/scripts/static-checks.sh`, `guest/README.md`

### Institutional Learnings

- `docs/solutions/tooling-decisions/align-flake-nixpkgs-to-downstream-pin-for-cache-coherence-2026-05-27.md` — when bumping the nix-on-rocks input, verify both repos' nixpkgs channels still align (`nixos-25.11`), or aarch64 builds silently lose the cache
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md` — module defaults stay conservative (`enable = false`, safe paths); the SM8550 image asserts the operational posture; pair with an eval-time check so a forgotten posture fails loudly
- `docs/solutions/tooling-decisions/vendor-sdl2-mali-fbdev-for-moonlight-on-fbdev-only-handhelds-2026-05-28.md` — established vendoring shape: derivation under `product/vendor/`, wired at the overlay boundary; do not vendor the mutable Valve runtime into the closure
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md` — post-bump deploys target the guest store on port 2222; `readlink -f`; generation import/switch helpers only
- `docs/solutions/runtime-errors/steam-desktop-ui-arm64-manifest-spinner-rocknix-2026-05-04.md` — client manifest must exist before launch; the vendored bootstrap script already carries manifest-repair behavior, preserve it during the port

### Session Evidence (2026-06-10 bandai smoke)

- `steamwebhelper.sh` hard-execs `taskset 0x7e`; FHS capsule lacks util-linux → 10s crash loop
- `steam-arm64-seed` unzip creates literal `steamrtarm64\libs\...` entries; symlinks land in junk dirs
- bwrap dies when launch cwd is unreadable by the steam user (`Can't chdir to /root`)
- Steam needs `LimitNOFILE` ≫ 1024 (`Too many open files` death spiral at session default)
- Launch env needs `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, DBus address of the korri session user (uid 2000)

---

## Key Technical Decisions

- **Hard break, lock-bump sequenced**: nix-on-rocks removal merges first; the korri PR lands vendor + module + platform rewire + `flake.lock` bump atomically. No `disabledModules` shim ever exists — the duplicate-option collision is impossible because the substrate module and the korri module are never in the same evaluation. Consequence: between the two merges, korri `trunk` still builds fine against its old locked rev (locks insulate; the sibling checkout's state is irrelevant).
- **Vendor dir `product/vendor/steam-korri/`, overlay attr `steam-korri`**: follows the `-korri` suffix convention for korri-owned variants (`gamescope-korri`, `sunshine-korri`). Deliberately does not shadow `pkgs.steam` — x86 desktop-lab uses nixpkgs steam.
- **Module namespace `services.korri.steam.*`**: matches every korri module; the `rocknix.steam.*` namespace dies with the substrate module. Module key `korri-steam`, registered in `modules.nix` as an opt-in aggregate bundling `korri-runtime` (mirrors `korri-removable-media`).
- **Paths follow korri-runtime, derived not duplicated**: defaults read `services.korri.runtime.*` — steam home `<stateRoot>/steam`, library `<gamesRoot>/steam`, dot-dir `<home>/.steam`. `hasPrefix` assertions reject `/storage` by construction. (see session decision: `/storage` deprecated; learnings note about `/storage` persistence is superseded by the device platform decision — `/` is the persistent 923G partition on current devices)
- **Launcher renamed `korri-steam-guest`**: the module-generated wrapper (session env + defaults + uinput prep) takes the korri name; internal package scripts (`steam-arm64-seed`, `steam-guest-run`, …) keep their names to keep the vendor diff reviewable.
- **Launch hardening lives in the module as a systemd service**: `korri-steam.service` (manual-start, `User` = korri runtime user, `LimitNOFILE=524288`, `WorkingDirectory` = steam home, session env) — codifies the smoke's `systemd-run` incantation without entering session-orchestration territory (that's the gamescope backlog item).
- **Conservative module defaults, image sets posture**: `enable = false` default; `rocknix-sm8550.nix` enables and pins paths; sm8550 config check asserts the posture at eval time.
- **Mutable Valve payload stays out of the Nix store**: unchanged v1 contract (`immutable-nix-store-valve-arm64-seed-artifacts=false`); the vendor move does not change the seed/self-update runtime model.

---

## Open Questions

### Resolved During Planning

- Shadow `pkgs.steam`? — No: x86 desktop-lab depends on nixpkgs steam; use `steam-korri` attr only
- Keep `rocknix.steam.*` option names for continuity? — No: hard break means korri conventions win; nothing external consumes the old namespace after removal
- Does the korri PR need to build against a steam-less substrate before upstream merges? — No: `flake.lock` pins the old rev until the bump lands in the same PR as the vendor

### Deferred to Implementation

- Exact dep list the FHS capsule needs beyond `util-linux` — discover from `buildFHSEnv` eval on aarch64 during U1; the smoke only proved taskset missing
- Whether `guest/launchers/start_moonlight_embedded_gamescope.sh` in nix-on-rocks references steam materially or just in comments — inspect during U6
- Whether the seed script's backslash fix is best done with `unzip` replacement (`bsdtar`) or post-extract normalization — decide in U1 with a contract test either way
- nixpkgs channel drift between the repos at bump time — check both locks during U7, align if needed per the cache-coherence learning

---

## Output Structure

    product/vendor/steam-korri/
    ├── package.nix          # callPackage-compatible; helpers + FHS capsule (aarch64)
    ├── manifest.nix         # data-only contract copy (ROCKNIX provenance, CDN URLs, resources)
    ├── check.nix            # colocated package-output contract check
    ├── README.md            # ownership note, runtime model, provenance
    ├── scripts/             # steam-arm64-{seed,bootstrap}, steam-guest-{run,native,runtime-prep}
    └── resources/           # compatibilitytool.vdf, registry.vdf, toolmanifest.vdf

    product/systems/nixos/modules/
    └── korri-steam.nix      # services.korri.steam.* adapter module

---

## Implementation Units

### U1. Vendor the Steam package with smoke fixes

**Goal:** `product/vendor/steam-korri/` builds the helpers + FHS capsule standalone, with the three bandai fixes applied.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Create: `product/vendor/steam-korri/package.nix`
- Create: `product/vendor/steam-korri/manifest.nix`
- Create: `product/vendor/steam-korri/scripts/` (5 scripts, copied then patched)
- Create: `product/vendor/steam-korri/resources/` (3 vdf files, byte-identical to upstream)
- Create: `product/vendor/steam-korri/README.md`

**Approach:**
- Copy from `../nix-on-rocks/packages/steam/` at the pinned rev (`910531d`), then apply fixes as reviewable deltas
- Add `util-linux` to the FHS `targetPkgs` (taskset for `steamwebhelper.sh`)
- Fix `steam-arm64-seed` zip extraction so backslash-named entries land as proper subpaths (decide `bsdtar` vs post-extract normalization during implementation)
- Make `steam-guest-run` cd to `STEAM_HOME` before invoking the capsule (it already does before client exec; the capsule entry itself must not inherit an unreadable cwd)
- Preserve `passthru` contract (`rocknixSteamHasRunCapsule`, manifest, helpers, fhs) — the module assertion depends on it
- Update `nix-support` provenance manifest: keep ROCKNIX upstream attribution, add korri vendoring provenance (source rev vendored from)

**Test scenarios:**
- Happy path: package evaluates and builds for `aarch64-linux`; `bin/steam-arm64-seed`, `bin/steam-guest-run`, `bin/steam-arm64-fhs` exist
- Happy path: FHS capsule closure contains `taskset`
- Edge case: x86_64 build exposes helpers but no run capsule (`rocknixSteamHasRunCapsule = false`), matching upstream behavior
- Error path: seed `--dry-run` with unset `STEAM_HOME` exits 2 with the explicit env error (existing contract preserved)

**Verification:**
- `nix build .#steam-korri` succeeds for both systems once U2 wires exposure; capsule closure provably contains util-linux

---

### U2. Register in overlay and flake packages

**Goal:** `steam-korri` is reachable as `pkgs.steam-korri` inside all image evals and as `packages.<system>.steam-korri` from the flake.

**Requirements:** R1, R5

**Dependencies:** U1

**Files:**
- Modify: `product/systems/nixos/overlays/korri-packages.nix`
- Modify: `product/systems/nixos/flake/packages.nix`

**Approach:**
- Additive overlay attr only (`steam-korri = final.callPackage ../../../vendor/steam-korri/package.nix { }`); do not shadow `pkgs.steam`
- Mirror the `libretro-fake-08` exposure pattern in `packages.nix`

**Test scenarios:**
- Test expectation: none beyond U3's checks — pure wiring; the package-contract check and `nix flake check` evaluation prove exposure

**Verification:**
- `nix build .#steam-korri --no-link` resolves on x86_64 (helpers-only) and dry-builds for aarch64

---

### U3. Package-contract Nix check

**Goal:** The packaging contract (entry points, passthru, resources, provenance manifest) is enforced by a colocated check registered in the standard-native owner matrix.

**Requirements:** R8

**Dependencies:** U1, U2

**Files:**
- Create: `product/vendor/steam-korri/check.nix`
- Modify: `product/systems/nixos/flake/checks.nix` (import + `ownerMatrix` entry, owner `"package-output"`)

**Approach:**
- Port the assertions from nix-on-rocks `nix/tests/steam-package-output-contract.nix`, adding: capsule closure contains taskset; seed script contains the backslash-handling fix marker; provenance manifest carries the vendored-from rev
- Follow `product/vendor/libretro-fake-08/check.nix` shape

**Test scenarios:**
- Happy path: check passes against the built package
- Error path: check fails loudly (named assertion) when an entry point or passthru key is missing — prove once by inspection of the failure branch during development

**Verification:**
- `just test-nix` runs the new check via `korri-standard-native`; missing owner-matrix entry would fail the standard-native check itself

---

### U4. Port the guest module as `korri-steam.nix`

**Goal:** A korri-owned module provides options, launcher, uinput prep, and the hardened launch service — on korri-runtime paths.

**Requirements:** R3, R4

**Dependencies:** U1, U2

**Files:**
- Create: `product/systems/nixos/modules/korri-steam.nix`
- Modify: `product/systems/nixos/flake/modules.nix` (opt-in `korri-steam` aggregate bundling `korri-runtime`)

**Approach:**
- Port from `../nix-on-rocks/guest/modules/steam.nix`, renaming namespace to `services.korri.steam.*`, module key `korri-steam`
- Path options default from `services.korri.runtime.*`: home `<stateRoot>/steam`, library `<gamesRoot>/steam`, dot-dir `<runtime.home>/.steam`; `hasPrefix` assertions mirror `korri-runtime.nix` (reject anything outside the sanctioned roots, `/storage` impossible by construction)
- Keep upstream assertions: aarch64-only, `rocknixSteamHasRunCapsule` on the configured package (default `pkgs.steam-korri`)
- Launcher wrapper renamed `korri-steam-guest`: session env (runtime user's `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, DBus), path env from module options, default gamepadui args, uinput prep
- Port `main-space-steam-uinput` service as `korri-steam-uinput`
- New `korri-steam.service`: manual-start systemd service, `User` = korri runtime user, `LimitNOFILE=524288`, `WorkingDirectory` = steam home, exec `korri-steam-guest` — codifies the smoke's working `systemd-run` shape
- `enable` defaults to `false` (module conservative; image sets posture)
- tmpfiles rules create steam home/library dirs owned by the runtime user (fixes the root-owned-seed failure class)

**Test scenarios (module-eval check, lands in U5's check wiring):**
- Happy path: enabled module on aarch64 fixture exposes `korri-steam-guest` in systemPackages, defines `korri-steam-uinput` and `korri-steam` services with `LimitNOFILE=524288` and correct `User`
- Happy path: path defaults derive from overridden `services.korri.runtime.stateRoot` (override runtime, observe steam paths follow)
- Error path: setting a steam path outside the sanctioned roots fails eval with the module's named assertion message
- Error path: enabling on an x86_64 fixture fails the aarch64 assertion
- Edge case: `enable = false` contributes nothing (no services, no packages)

**Verification:**
- Module-eval check passes; option docs render (`description` fields present on every option)

---

### U5. Rewire the SM8550 platform and extend the config check

**Goal:** The SM8550 image composes Steam exclusively via `korri-steam`; the composed-system check pins the posture.

**Requirements:** R5, R8

**Dependencies:** U4

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix` (drop `substratePackages.steam` from systemPackages ~line 561; import `../../modules/korri-steam.nix`; enable + assert posture)
- Modify: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Modify: `product/systems/nixos/flake/checks.nix` (module-eval check registration for U4, owner `"module"`)

**Approach:**
- Image-level posture per the architectural-posture learning: `services.korri.steam.enable = true` plus explicit path pins in the platform module
- Config check asserts: steam helpers in systemPackages, `korri-steam-uinput` and `korri-steam` services present, steam home resolves under `/var/lib/korri`, no package with the substrate's store name sourced from `nix-on-rocks.packages`

**Test scenarios:**
- Happy path: `korri-rocknix-sm8550-config-check` passes for thor and sobo systems with the new assertions
- Integration: full toplevel dry-build (`just sm8550-kiosk-toplevel-check`) succeeds — proves no eval-time collision with `rocknix-guest-base` (which still imports the substrate steam module until U6/U7; collision is impossible only because namespaces differ — verify explicitly that both modules coexist in this interim state without option clash, since `rocknix.steam.*` and `services.korri.steam.*` are disjoint and the substrate module defaults to disabled-by-shape)

**Verification:**
- Both SM8550 system toplevels dry-build; config check enforces the posture

---

### U6. Remove Steam from nix-on-rocks

**Goal:** The substrate no longer ships Steam in any output.

**Requirements:** R6

**Dependencies:** U1 (vendored copy exists, reviewed) — upstream removal must not merge before the korri vendor PR is ready to land

**Target repo:** `nix-on-rocks` (sibling checkout `../nix-on-rocks`)

**Files:**
- Delete: `packages/steam/` (package.nix, manifest.nix, scripts/, resources/, tests/)
- Delete: `guest/modules/steam.nix`
- Modify: `guest/profiles/rocknix-guest-base.nix` (drop the `../modules/steam.nix` import, line ~100)
- Delete: `nix/tests/steam-package-output-contract.nix`
- Modify: `flake.nix` (drop `packages.steam` output + check registration)
- Modify: `nix/tests/flake-surface-contract.nix` (remove steam from the expected surface)
- Modify: `guest/scripts/static-checks.sh`, `guest/README.md` (drop steam references)
- Inspect: `guest/launchers/start_moonlight_embedded_gamescope.sh` (remove or keep per what the reference actually is)

**Test scenarios:**
- Happy path: `nix flake check` passes in nix-on-rocks post-removal (surface contract updated)
- Error path: `nix eval .#packages.aarch64-linux.steam` fails with attribute-missing — the output is gone, not deprecated
- Integration: `nixosConfigurations.rocknix-guest` toplevel still evaluates (base profile no longer imports the deleted module)

**Verification:**
- nix-on-rocks CI green on the removal PR; merged to main before U7 lands

---

### U7. Bump flake.lock and verify the composed break

**Goal:** Korri builds against the steam-less substrate rev; the whole suite is green; the device runs the vendored Steam.

**Requirements:** R7

**Dependencies:** U5, U6

**Files:**
- Modify: `flake.lock` (nix-on-rocks input → post-removal rev)

**Approach:**
- `nix flake lock --update-input nix-on-rocks`
- Check channel alignment per the cache-coherence learning: if nix-on-rocks moved its nixpkgs pin, move korri's in step (document blast radius if so)
- Remove the interim-coexistence caveat from U5's config check if any was needed

**Test scenarios:**
- Happy path: `just test-nix` and `just sm8550-kiosk-toplevel-check` pass on the bumped lock
- Integration: deploy to bandai via the guest-only path (port 2222, `readlink -f`, generation import/switch per the deploy learning); `korri-steam-guest` launches Steam Big Picture from the `korri-steam.service` unit; fresh seed lands under `/var/lib/korri/steam` owned by the runtime user
- Error path: confirm the old substrate launcher (`rocknix-steam-guest`) is absent from the new generation

**Verification:**
- CI green on korri trunk; on-device smoke shows Big Picture under the new paths with no `/storage` writes

---

## System-Wide Impact

- **Interaction graph:** `rocknix-guest-base` (substrate) loses its steam import — any other nix-on-rocks consumer relying on substrate steam breaks by design (hard break; korri is the only known consumer)
- **Error propagation:** module assertions move failures from on-device runtime surprises to eval time (wrong paths, wrong arch, missing capsule)
- **State lifecycle risks:** existing `/storage` Steam state on bandai (~4GB) is orphaned, not migrated; fresh seed required post-deploy. tmpfiles ownership rules prevent the root-owned-state failure class from recurring
- **API surface parity:** launcher name changes (`rocknix-steam-guest` → `korri-steam-guest`); device docs/handoffs referencing the old name go stale — acceptable, noted in the vendor README
- **Integration coverage:** composed-system check (U5) plus on-device smoke (U7) cover what module-eval checks cannot: real session launch, seed ownership, fd limits under the real unit
- **Unchanged invariants:** the mutable Valve runtime model (seed + self-update outside the Nix store), the package's helper-script contract (`steam-arm64-*` names, env-driven paths), `desktop-lab.nix`'s use of nixpkgs steam on x86, and all non-steam substrate surfaces

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Interim state (U5 merged, U6 not): substrate module + korri module coexist in one eval | Namespaces are disjoint (`rocknix.steam.*` vs `services.korri.steam.*`); substrate module contributes packages via its own enable gate — verify coexistence explicitly in U5's toplevel dry-build; sequence merges tightly |
| nix-on-rocks nixpkgs pin drift at bump time → aarch64 cache loss | Check both locks in U7; align per the cache-coherence learning before merging |
| Path move strands device state | Accepted: declared out of scope; fresh seed on device, noted in PR |
| FHS capsule dep gaps beyond taskset (only one crash observed, not exhaustively probed) | U7 on-device smoke is the gate; capsule deps are a one-line follow-up if more surface |
| `korri-steam.service` env assumptions (uid-2000 session) drift when gamescope session work lands | Service is manual-start and options-driven; the gamescope backlog item owns superseding it |

---

## Documentation / Operational Notes

- Vendor README documents: ownership (korri), upstream provenance (ROCKNIX via nix-on-rocks rev), the mutable-runtime contract, and the launcher rename
- Stale references to `rocknix-steam-guest` and `/storage` Steam paths exist in `docs/handoffs/` and `docs/acceptance/` from prior sessions — historical artifacts, not updated by this plan
- Post-merge deploy follows `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`

---

## Sources & References

- Session evidence: bandai Steam bring-up smoke, 2026-06-10 (this work item's originating session)
- Backlog: `01KTT1YSXV…` (productize launch path — partially executed by this plan), `01KTT615NE…` (first-run flow), `01KTT615NF…` (gamescope session)
- Upstream source: `github:simonwjackson/nix-on-rocks` rev `910531d` (`packages/steam/`, `guest/modules/steam.nix`)
- Related code: `product/systems/nixos/overlays/korri-packages.nix`, `product/systems/nixos/flake/{checks,modules,packages}.nix`, `product/systems/nixos/modules/korri-runtime.nix`, `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
