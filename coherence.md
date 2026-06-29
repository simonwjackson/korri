# Coherence findings: Steam self-managed lifecycle plan

## 1. Clarify that the no-mutation rule excludes only first bootstrap, not normal startup

**Issue:** The plan says Steam should self-manage mutable ARM64 client/runtime files and normal startup must not mutate Steam-owned files, but it also keeps `steam-arm64-seed` responsible for downloading/installing ARM64 Steam client/runtime payloads. Readers can reasonably disagree on whether the seed/bootstrap service is an allowed exception or a violation of the ownership boundary.

**Evidence:**
- Summary says Steam should self-manage mutable ARM64 client/runtime files and Korri removes default pre-start mutation.
- R1 preserves a valid ARM64 bootstrap path.
- Relevant Code says `steam-arm64-seed` downloads/installs ARM64 Steam client/runtime payloads.
- Key Decisions separately allow a seed-only manifest URL.

**Actionable document fix:** Add a short ownership-boundary sentence near R2 / Key Technical Decisions: initial seed/bootstrap may create the minimum ARM64 client/runtime payload needed to hand control to Steam, but normal startup and reactive repair must not patch or rewrite Steam-owned runtime files after that handoff.

## 2. Narrow `publicbeta` regression language to tracking/channel state, not seed-only URLs

**Issue:** R6 broadly says tests must fail on hardcoded `publicbeta`, while Key Decisions and Open Questions explicitly allow keeping a seed-only manifest URL separate from `package/beta` if stable seed resolution is not verified. As written, the test requirement can contradict the allowed seed URL exception.

**Evidence:**
- R6: tests/checks must fail if the product regresses to hardcoded `publicbeta`.
- Key Decisions: initial ARM64 seed download URL and ongoing channel label are separate; implementation may keep a seed-only manifest URL.
- U1 Approach: keep seed download URL and channel label deliberately separate unless stable manifest is verified.

**Actionable document fix:** Rewrite R6 and U1 test scenarios to say tests fail when `publicbeta` is hardcoded as the tracking channel, `package/beta`, installed-marker selector, or service `STEAM_BETA`; if a `publicbeta` seed-only URL remains, it must be named as the documented bootstrap exception and not drive channel state.

## 3. Fix the “VDF/config before startup” summary to match the localconfig carve-out

**Issue:** The Summary and R3 say Korri declares VDF/config state before startup, but U3 later says per-user/per-game `localconfig.vdf` writes depend on Steam-created userdata folders and may still use the existing stop/write/start lifecycle. The detailed U3 boundary is more specific and should control.

**Evidence:**
- Summary: Korri/NixOS declares VDF/config state before startup.
- R3: Korri must continue declaring Korri-owned Steam state before startup, including VDF/config seeds.
- U3 Approach: global default config may be pre-start; per-user localconfig remains materializer-owned and may need the existing stop/write/start lifecycle.

**Actionable document fix:** Change Summary/R3 to distinguish global/default config seeded before Steam starts from per-user/per-game localconfig managed by the materializer lifecycle after userdata exists.

## 4. Define “runtime prep” by mode so default-disabled does not conflict with Proton patching

**Issue:** The plan uses “runtime prep disabled by default” as shorthand, but U2 preserves `steam-guest-runtime-prep --patch-proton` for Korri-owned Proton artifacts. Without consistently naming the mode, future readers may disable the whole helper, including the allowed Proton-only path.

**Evidence:**
- U2 Approach removes/disables default `steam-guest-runtime-prep --apply` and keeps `--apply` only as explicit legacy/manual tooling.
- U2 Approach preserves `--patch-proton` for Korri-owned Proton artifacts.
- Documentation notes say the proven product fix is “runtime prep disabled by default.”

**Actionable document fix:** Replace broad “runtime prep disabled by default” wording with “`steam-guest-runtime-prep --apply` disabled in normal startup”; explicitly state that `--patch-proton` remains allowed only for Korri-owned Proton artifacts and must not touch Steam-owned runtime files.

## 5. Make package metadata ownership explicit

**Issue:** “Package metadata” is used as Korri-owned state, recovery input, and state to preserve, but the plan does not define which files are Korri-owned versus Steam-owned. This blurs whether `.installed` / `.manifest` files are writable by Korri, preserved by recovery, or only inspected for channel state.

**Evidence:**
- R3 lists package metadata as Korri-owned Steam state before startup.
- R5 targets stale pending update markers and mixed package metadata.
- Key Decisions scope recovery to stale package markers and IPC cleanup.
- U5 requires recovery to preserve `.installed` and `.manifest` files and remove only pending markers.

**Actionable document fix:** Add a small package-state glossary/table: e.g. `package/beta` and declared compat metadata are Korri-declared; channel `.installed` / `.manifest` files are Steam/seed-observed and must be preserved by recovery; pending markers are recovery-removable after backup.

## 6. Align test/check file lists with the scenarios they claim to verify

**Issue:** Several implementation units reference module checks or package contract checks in scenarios, but their `Files:` test lists do not consistently include those checks. This makes the plan internally inconsistent about where verification lives.

**Evidence:**
- U4 test scenarios say a module check verifies restart behavior, but U4 lists only `nixos-module.test.ts` as a test file.
- U5 test scenarios say module checks verify helper availability, but U5 lists only `nixos-module.test.ts` as a test file.
- U6 test scenarios mention documentation/package contract tests catching ownership drift, but U6 only lists `module-check.nix` as a test file.

**Actionable document fix:** Add the referenced check files to each unit’s `Test:` list, or rewrite the scenarios to name the actual listed test file. In U6, either add the package contract check file to `Files:`/`Test:` or remove the package-contract test expectation from that unit.
