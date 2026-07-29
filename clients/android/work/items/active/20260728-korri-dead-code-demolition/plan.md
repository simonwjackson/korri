---
title: "refactor: Delete dead code from the Korri Artemis fork (Apollo plumbing, external display, GameMenu)"
type: refactor
status: complete
date: 2026-07-28
verify_command: "nix develop --command ./gradlew assembleNonRoot_gameDebug testNonRoot_gameDebugUnitTest --no-daemon"
---

# refactor: Delete dead code from the Korri Artemis fork

## Summary

Execute the demolition phases unlocked by three architectural decisions (Apollo dropped, web surfaces replace native UI, one-app collapse): revert-forward the TEMP debug commit, relocate `GameMenu`'s load-bearing constants, then land one surgical deletion commit per bucket — clipboard sync, server commands, virtual-display/scale-factor/custom-refresh-rate, the external-display feature, `GameMenu`, and small zombies. The PcView/AppView/StreamSettings mass is deferred behind in-shell pairing. The shortcut ecosystem (trampoline, pinned shortcuts, TV channels, `.art` files) is explicitly kept.

## Implementation Outcome

Completed on `spike/korri-shell-webview` as eight atomic demolition units:

- `750c83ae` — revert-forward the temporary config overlay
- `4c07a872` — relocate live `GameMenu` configuration constants
- `d4c7ec93` — remove Apollo clipboard synchronization
- `ccb93a87` — remove Apollo server commands
- `1af9e75e` — remove Apollo display-negotiation settings
- `ec0b479d` — remove the external-display control surface
- `41e6338d` — remove the native game menu
- `fae97adb` — remove the debug activity and orphan layouts

Tier-2 shipping review added two focused follow-up commits: `5acc738a` keeps active controller mouse emulation toggleable off after its live setting is disabled, and `3b81cf15` removes the obsolete “Primary Display” distinction from the legacy app-list start action.

Implementation decisions refined during execution:

- The app-level virtual-display seam was removed completely instead of retaining parameters hardwired to `false`; the untouched protocol defaults remain in `StreamConfiguration`/`NvHTTP`.
- `GameInputDevice` and its `MenuOption` contract were removed after U7 proved they only served the deleted native menu; the underlying controller mouse-emulation behavior remains live.
- Guide/Xbox is the intentional, user-confirmed overlay input and replaces L3+R3. Guide opens the overlay on release and closes it through `Game.dispatchKeyEvent()` when the WebView owns focus.

Final evidence:

- `assembleNonRoot_gameDebug`, `KorriSettingsBridgeTest`, and all `*IntentTest` tests pass.
- The complete Robolectric run reports 195 tests, exactly the five pre-existing failures, zero errors, and zero skipped tests: `LayoutInflationTest#allLayoutsInflateSuccessfully`, both `ProfilesNavigationTest` cases, `SimpleStartupTest#testApplicationOnCreate`, and `StartupTest#testApplicationStartup`.
- Residual searches are clean for deleted clipboard, app-level server-command, virtual/external-display, `GameMenu`/`GameInputDevice`, debug-info, and orphan-layout symbols. The required native `MoonBridge.sendExecServerCmd`/JNI symbols and `StreamConfiguration.resolutionScaleFactor` protocol default remain.
- The final APK installs on both tablet and fold; `KorriShellActivity` cold-starts successfully, and a dummy `.art` file routes through `ShortcutTrampoline` without a fatal exception.
- Full visual settings → paired stream → Guide overlay smoke remains externally blocked: both available devices were PIN-locked during final verification, and the tablet's selected host was already known to be unpaired. Earlier pre-final tablet checks rendered the Korri shell/settings successfully. This limitation is recorded rather than treating the expected full-suite exit code or inaccessible devices as an implementation failure.

---

## Problem Frame

The fork carries ~7,500 LOC of dead or dormant upstream code that no longer has a UI path in the Korri shell architecture. Every future spike commit pays a navigation and comprehension tax on it, and the additive-fork discipline (tiny diffs to upstream files) is easier to audit once whole dead features are gone. Upstream is frozen (Oct 2025), so deletion carries no rebase risk. A full reachability analysis (this session) classified every candidate as DEAD / ZOMBIE / ALIVE; this plan executes the deletable subset.

---

## Requirements

- R1. Apollo-only client plumbing is removed: clipboard sync, server commands, virtual display negotiation, resolution scale factor, custom refresh rate.
- R2. The external-display (dual-screen) feature is removed: `ExternalDisplayControlActivity`, its receiver, and all `Game`/`ServerHelper` branches that serve it.
- R3. The TEMP debug commit content is reverted-forward: the `Game.java` config-overlay hack and `TEMP_CONFIG_OVERLAY_REMOVAL.md` are removed; `test-intents.html` is kept (it exercises the retained intent-override workflows).
- R4. The shortcut ecosystem keeps working: `ShortcutTrampoline`, `ShortcutHelper`, `TvChannelHelper`, `PosterContentProvider`, `.art` file handling, and `Game`'s shortcut-usage reporting.
- R5. `GameMenu` is deleted without breaking ALIVE consumers: the `specialPrefs`/`special_key` SharedPreferences contract used by the keyboard virtual controller and the `KEY_UP_DELAY` timing constant used by `Game` are relocated unchanged; the menu-only `GameInputDevice`/`MenuOption` contract is deleted.
- R6. Every implementation unit is one atomic commit that builds green and keeps all Korri tests green (`KorriSettingsBridgeTest`, all `*IntentTest`); the 5 pre-existing upstream Robolectric failures remain exactly 5.
- R7. After Phase 1 (Apollo plumbing) and again after the final unit, the debug APK boots through the full path: shell → web settings → stream launch → Guide/Xbox overlay. If paired-device or lock state prevents the final live-stream path, record the external blocker and the strongest available APK/activity/shortcut evidence.
- R8. No `moonlight-core`/JNI changes; `PreferenceConfiguration` reads for ALIVE features stay intact (defaults still apply to features whose UI is gone).
- R9. The Phase 3 mass deletion and its unblocker contract are documented as deferred follow-up work, not silently dropped.

---

## Scope Boundaries

- No changes to `moonlight-core` or any JNI surface (unused native declarations like `MoonBridge.sendExecServerCmd` stay).
- No changes to the 38-key web settings schema (`KorriSettingsBridge`).
- No release-build R8/APK-size measurement — debug APK only.
- No new features: in-shell pairing, host-add, or applist refresh are not built here.
- No worktree isolation — deletions land as new commits directly on `spike/korri-shell-webview`.

### Deferred to Follow-Up Work

- **Phase 3 mass deletion** (PcView, AppView, `grid/` package, Profiles UI, StreamSettings, `res/xml/preferences.xml`, custom preference widgets, AddComputerManually, OTP-pairing branch in `PairingManager`, `.art` export slice in AppView/ShortcutHelper): blocked until in-shell pairing exists. Unblocker contract: shell bridge for `PairingManager` pair + host-add, and in-shell applist refresh via `ComputerManagerService.ComputerManagerBinder.createAppListPoller` (the poller is on the binder the shell already holds — AppView is not required for cache refresh). Capture as a backlog item when this plan completes.
- **Squash/keep decision for spike-branch history** — revert-forward (U1) resolves the tree; history cleanup, if ever wanted, is a separate decision.

---

## Context & Research

### Relevant Code and Patterns

Reachability analysis completed in-session (2026-07-28). Key findings the units rely on:

- Entry points: `KorriShellActivity` is the only launcher; `PcView`/`StreamSettings` are reachable solely via shell escape hatches; `AppView` only via PcView; `ShortcutTrampoline` via `.art` VIEW filter, pinned shortcuts, TV channels, and `AddComputerManually`.
- Clipboard sync is pure Java: `Game.java` (fields ~303–304, init ~571, `handleFocusChange`, `getClipboardContent`/`sendClipboard`/`getClipboard`, connect/disconnect hooks), `GameMenu` items, `NvHTTP.getClipboard`/`sendClipboard`, 3 prefs. No `MoonBridge` symbols involved.
- Server commands: `Game` (`EXTRA_SERVER_COMMANDS`, `getServerCmds`, `sendExecServerCmd`), `GameMenu.showServerCmd`, `NvConnection.sendExecServerCmd` (Java wrapper over native decl), `NvHTTP.getServerCmds`, `ComputerDetails.serverCommands` + Apollo permissions bitfield, `ServerHelper` intent extra.
- `GameMenu` load-bearing pieces: `PREF_NAME`/`KEY_NAME` consumed by `KeyBoardController`, `KeyBoardControllerConfigurationLoader`, and `StreamSettings`; `MenuOption` consumed by `GameInputDevice` + `ControllerHandler`; `KEY_UP_DELAY` consumed by `Game`.
- External display is dormant: gated on `checkbox_enable_fullexdisplay` (default false, absent from the Korri schema); consumers are `ServerHelper.createStartIntent`/`getSecondaryDisplay`, `Game.isOnExternalDisplay` branches, `StartExternalDisplayControlReceiver`.
- Already-dead layouts with no Java consumer: `app/src/main/res/layout/activity_game_display.xml`, `app/src/main/res/layout/activity_configure_virtual_controller.xml`.
- Tests: no test references `ShortcutTrampoline` or `ServerHelper`; `LayoutInflationTest` reflects over all `R.layout` fields (no hardcoded list); `*IntentTest`s assert `Game` extras constants.
- TEMP commit `11c9d31e` (merge-base of the spike branch) adds the perf-overlay config hack to `Game.java` (marked `REMOVE BEFORE PR`), `TEMP_CONFIG_OVERLAY_REMOVAL.md`, `test-intents.html`, and one `AGENTS.local.md` line.

### Institutional Learnings

- None available (`docs/solutions/` does not exist in this fork).

---

## Key Technical Decisions

- **Revert-forward, not rebase (U1):** history keeps the TEMP commit; one new commit cleans the tree. Zero risk to the ~16 spike commits stacked on it.
- **Keep `test-intents.html`:** the shortcut ecosystem stays, so its manual test harness stays with it.
- **Relocate before deleting (U2 before U7):** `GameMenu`'s live constants move to ALIVE homes with their literal values unchanged (`"specialPrefs"`, `"special_key"`), preserving on-device SharedPreferences data. The `GameInputDevice`/`MenuOption` seam was later removed after proving it was menu-only.
- **Protocol fields stay at defaults:** `StreamConfiguration.virtualDisplay`/`resolutionScaleFactor` and the `NvHTTP` launch query params remain (upstream protocol code, defaults `false`/`100`); only pref reads, UI, and negotiation paths are deleted. Minimal upstream diff.
- **Fully remove the app-level virtual-display seam:** `EXTRA_VDISPLAY` and the corresponding Java launch-helper parameters are removed rather than hardwired to `false`; `ShortcutTrampoline` and its retained override contracts remain. Protocol defaults stay in `StreamConfiguration`/`NvHTTP`.
- **Strings are deleted across all locales in the same commit:** a default string removed while `values-*/strings.xml` translations remain breaks AAPT2 resource linking, so each unit sweeps `res/values*/strings.xml` together.
- **Per-bucket atomic commits:** each unit below is one commit; no mixed "cleanup" commits, preserving additive-fork auditability.

---

## Open Questions

### Resolved During Planning

- External display: **drop** (user decision).
- Shortcut ecosystem: **keep** (user decision).
- TEMP commit: **revert-forward** (user decision, option A), with `test-intents.html` retained per synthesis confirmation.
- Applist-cache dependency: weaker than the handoff feared — `createAppListPoller` lives on the binder; documented in Deferred follow-up.

### Deferred to Implementation

- Exact set of `Game.isOnExternalDisplay` call sites and `GameMenu` dialog layout/drawable resources — enumerate by grep at execution time; the classes are known, the precise resource list is cheaper to derive when deleting.
- Whether any `*IntentTest` asserts `EXTRA_SERVER_COMMANDS` — check before U4; if so, delete that assertion in the same commit.
- Whether `AGENTS.local.md`'s TEMP-commit line is still wanted — inspect during U1.

---

## Implementation Units

### U1. Revert-forward the TEMP debug commit

**Goal:** Clean the tree of `11c9d31e`'s debugging artifacts without rewriting branch history.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `app/src/main/java/com/limelight/Game.java` (remove the `// TEMP: Append config values` block in the perf-overlay update path; restore `setText(text)`)
- Delete: `TEMP_CONFIG_OVERLAY_REMOVAL.md`
- Keep: `test-intents.html` (retained ecosystem harness)
- Inspect: `AGENTS.local.md` (drop the TEMP-commit line if it's stale)

**Approach:**
- Follow the removal instructions the TEMP commit itself shipped in `TEMP_CONFIG_OVERLAY_REMOVAL.md`, then delete that file too.

**Test scenarios:**
- Test expectation: none — reverting a debug-only overlay string; no behavioral contract changes. Existing test suite green is the gate.

**Verification:**
- Build succeeds; perf overlay (lite and big) shows only the normal stats text with no `Config:` line.

---

### U2. Relocate GameMenu's load-bearing constants

**Goal:** Move the shared-prefs contract and key-up timing constant out of `GameMenu` so ALIVE code survives its deletion.

**Requirements:** R5

**Dependencies:** None (must precede U7)

**Files:**
- Modify: `app/src/main/java/com/limelight/GameMenu.java` (reference the relocated constants until U7 deletes the class)
- Modify: `app/src/main/java/com/limelight/binding/input/virtual_controller/keyboard/KeyBoardController.java`, `app/src/main/java/com/limelight/binding/input/virtual_controller/keyboard/KeyBoardControllerConfigurationLoader.java`, `app/src/main/java/com/limelight/preferences/StreamSettings.java`, `app/src/main/java/com/limelight/Game.java` (retarget constant references)

**Approach:**
- `PREF_NAME`/`KEY_NAME` move to the keyboard configuration domain. `KEY_UP_DELAY` moves with the input/timing consumer in `Game`.
- Literal values must not change: `"specialPrefs"`, `"special_key"` are on-device data contracts. `GameInputDevice`/`MenuOption` remain untouched until U7 proves and deletes their menu-only seam.

**Patterns to follow:**
- Additive-fork discipline: retargeted imports only; no behavior or signature changes.

**Test scenarios:**
- Happy path: existing suite compiles and passes — `LayoutInflationTest`-adjacent keyboard code paths still resolve the same prefs namespace (constant-value equality is the contract; a trivial assertion in an existing Korri test file that the relocated constants equal `"specialPrefs"`/`"special_key"` is acceptable if a natural home exists, otherwise compile-time green suffices).

**Verification:**
- Build green; no remaining reference to `GameMenu.PREF_NAME`, `GameMenu.KEY_NAME`, `GameMenu.KEY_UP_DELAY`, or `GameMenu.MenuOption` outside `GameMenu.java` itself.

---

### U3. Delete clipboard sync (Apollo)

**Goal:** Remove the entire clipboard-sync feature: Game plumbing, menu items, HTTP endpoints, prefs, strings.

**Requirements:** R1, R8

**Dependencies:** U1 (both touch `Game.java`; keep diffs clean)

**Files:**
- Modify: `app/src/main/java/com/limelight/Game.java` (fields `clipboardManager`/`clipboardSyncRunning`, init, `handleFocusChange` clipboard branch, `getClipboardContent`, `sendClipboard`, `getClipboard`, connect-hook `handleFocusChange(true)` caller comment, `disconnect()` hook, the `isMenuOpen()` clipboard-suppression check)
- Modify: `app/src/main/java/com/limelight/GameMenu.java` (upload/fetch clipboard menu items)
- Modify: `app/src/main/java/com/limelight/nvstream/http/NvHTTP.java` (`getClipboard`, `sendClipboard`)
- Modify: `app/src/main/java/com/limelight/preferences/PreferenceConfiguration.java` (3 pref keys, 3 fields, 3 reads)
- Modify: `app/src/main/res/xml/preferences.xml` (smart-clipboard checkboxes), `app/src/main/res/values*/strings.xml` (clipboard strings, all locales)
- Modify: `app/src/main/java/com/limelight/ui/StreamView.java` (drop unused `ClipboardManager` import)

**Approach:**
- Pure Java + resources; no JNI. `CLIPBOARD_IDENTIFIER` and any clip-echo bookkeeping in `Game` go with it.

**Test scenarios:**
- Happy path: full unit suite green; `KorriSettingsBridgeTest` unchanged (schema never exposed clipboard keys).
- Edge case: no residual reference to the three clipboard pref keys anywhere in `app/src/main` (grep-clean), so stale on-device prefs are simply ignored.

**Verification:**
- Build + tests green; APK boots and streams; losing/regaining focus during a stream causes no toast/clipboard activity.

---

### U4. Delete server commands (Apollo)

**Goal:** Remove server-command execution end to end, leaving the native declaration untouched.

**Requirements:** R1, R8

**Dependencies:** U3 (sequential edits to `Game.java`/`GameMenu.java`/`NvHTTP.java`)

**Files:**
- Modify: `app/src/main/java/com/limelight/Game.java` (`EXTRA_SERVER_COMMANDS`, `serverCommands` field + intent read, `sendExecServerCmd`, `getServerCmds`)
- Modify: `app/src/main/java/com/limelight/GameMenu.java` (`showServerCmd`, server-cmd menu item + empty-dialog flow)
- Modify: `app/src/main/java/com/limelight/nvstream/NvConnection.java` (`sendExecServerCmd` wrapper; `MoonBridge.sendExecServerCmd` native decl stays)
- Modify: `app/src/main/java/com/limelight/nvstream/http/NvHTTP.java` (`getServerCmds`, `details.serverCommands` assignment)
- Modify: `app/src/main/java/com/limelight/nvstream/http/ComputerDetails.java` (`serverCommands` field/copy, Apollo permissions bitfield incl. clipboard/file/server-cmd bits)
- Modify: `app/src/main/java/com/limelight/utils/ServerHelper.java` (drop the `EXTRA_SERVER_COMMANDS` putExtra)
- Modify: `app/src/main/res/values*/strings.xml` (server-cmd strings, all locales)

**Approach:**
- Check first whether any `*IntentTest` asserts `EXTRA_SERVER_COMMANDS`; if so, remove that assertion in this commit (R6 keeps the rest green).

**Test scenarios:**
- Happy path: full suite green; intent tests still pass with the extra gone.
- Integration: stream launch from the shell works with the extra absent from the `Game` intent.

**Verification:**
- Build + tests green; no `serverCmd`/`ServerCmd` references remain in `app/src/main/java` except the `MoonBridge` native declaration.

---

### U5. Delete virtual display, resolution scale factor, custom refresh rate (Apollo)

**Goal:** Remove the three Apollo-only negotiation/settings features while leaving protocol fields at defaults.

**Requirements:** R1, R4, R8

**Dependencies:** U4

**Files:**
- Modify: `app/src/main/java/com/limelight/preferences/PreferenceConfiguration.java` (`useVirtualDisplay`, `resolutionScaleFactor`, `customRefreshRate`: keys, fields, reads)
- Modify: `app/src/main/java/com/limelight/AppView.java` (delete vdisplay context-menu items, gated launch branches, and vdisplay helper arguments)
- Modify: `app/src/main/java/com/limelight/ShortcutTrampoline.java` (call the retained launch helpers without a vdisplay argument; the trampoline itself remains, R4)
- Modify: `app/src/main/java/com/limelight/PcView.java` (remove vdisplay launch-helper arguments)
- Modify: `app/src/main/java/com/limelight/Game.java` (drop `.setResolutionScaleFactor(...)` and `EXTRA_VDISPLAY` handling)
- Modify: `app/src/main/java/com/limelight/utils/UiHelper.java` (vdisplay-not-supported/not-ready dialog)
- Modify: `app/src/main/java/com/limelight/nvstream/http/NvHTTP.java` (`VirtualDisplayCapable`/`VirtualDisplayDriverReady` serverinfo parsing and the `ComputerDetails` fields they feed, if nothing else consumes them)
- Modify: `app/src/main/java/com/limelight/preferences/StreamSettings.java` (custom-refresh-rate UI blocks, vdisplay/scale-factor preference wiring)
- Modify: `app/src/main/res/xml/preferences.xml` + `app/src/main/res/values*/strings.xml` (all three features' entries/strings, all locales)
- Keep: `app/src/main/java/com/limelight/nvstream/StreamConfiguration.java` untouched (defaults `false`/`100`)

**Approach:**
- The Korri schema already dropped these keys (commit `0de7dafd`); this unit deletes the native reads and negotiation so defaults are structural, not incidental.

**Test scenarios:**
- Happy path: suite green; `KorriSettingsBridgeTest` unchanged.
- Integration: shell and shortcut streams launch without an app-level vdisplay extra/parameter; untouched protocol launch params still carry `scaleFactor=100`, `virtualDisplay=0` from `StreamConfiguration` defaults.
- Edge case: `StreamSettings` (legacy escape hatch) still opens without the removed preferences present.

**Verification:**
- Build + tests green; legacy settings screen opens; stream launches on device.

---

### U6. Delete the external-display feature

**Goal:** Remove the dual-screen feature and every branch that serves it.

**Requirements:** R2

**Dependencies:** U5 (sequencing on shared files)

**Files:**
- Delete: `app/src/main/java/com/limelight/utils/ExternalDisplayControlActivity.java`, `app/src/main/java/com/limelight/StartExternalDisplayControlReceiver.java`
- Modify: `app/src/main/AndroidManifest.xml` (activity + receiver entries)
- Modify: `app/src/main/java/com/limelight/utils/ServerHelper.java` (secondary-display branch in `createStartIntent`, touchpad-intent launch, `getActiveDisplay`/`getSecondaryDisplay` if unconsumed after this)
- Modify: `app/src/main/java/com/limelight/Game.java` (all `isOnExternalDisplay` branches: `quit()` context selection, `showGameMenu` ext path, others enumerated by grep)
- Modify: `app/src/main/java/com/limelight/preferences/PreferenceConfiguration.java` (`enableFullExDisplay` field + read)
- Modify: `app/src/main/res/xml/preferences.xml`, `app/src/main/res/values/styles.xml` (`ExternalDisplayControllerTheme`), `app/src/main/res/values*/strings.xml`, drawables (`ic_menu_external` etc. if unconsumed)

**Approach:**
- `Game.showGameMenu` collapses to the Korri overlay path only — this is the change that leaves `GameMenu` with zero runtime consumers, enabling U7.

**Test scenarios:**
- Happy path: suite green.
- Integration: stream launch remains unaffected; Guide/Xbox opens the Korri overlay.
- Error path: no receiver/activity remains registered in the manifest (install succeeds; no `ClassNotFoundException` on broadcast — verified by device boot/stream).

**Verification:**
- Build + tests green; on-device stream + overlay work; `rg -i "exdisplay|ExternalDisplay"` in `app/src/main` returns nothing.

---

### U7. Delete GameMenu

**Goal:** Remove the superseded native in-game menu now that nothing routes to it.

**Requirements:** R5

**Dependencies:** U2, U3, U4, U6

**Files:**
- Delete: `app/src/main/java/com/limelight/GameMenu.java`
- Modify: `app/src/main/java/com/limelight/Game.java` (`GameMenuCallbacks` interface + `gameMenuCallbacks` field/construction, `hideGameMenu` fallback, relocated `KEY_UP_DELAY` usage)
- Modify: `app/src/main/res/values*/strings.xml` (`game_menu_*` strings **without live consumers outside `GameMenu`**, all locales — retain `game_menu_select_mouse_mode` (used by `Game`) and `game_menu_toggle_mouse_on`/`_off` (used by `ControllerHandler`, unless the menu-option contract is also deleted)) and any menu-dialog layouts/drawables used only by `GameMenu` (enumerate at execution)

**Approach:**
- The Korri overlay remains the only in-stream menu surface. `GameInputDevice`/`MenuOption` are deleted because no consumer remains outside the native menu; live mouse-emulation behavior stays in `ControllerHandler`.

**Test scenarios:**
- Happy path: suite green; `ControllerHandler` retains its live mouse-emulation behavior without the deleted menu-option type.
- Integration: Guide/Xbox and Back/Start-hold open the web overlay in a live stream; no dialog-based menu path remains.

**Verification:**
- Build + tests green; on-device overlay flow works; `rg "GameMenu"` in `app/src/main/java` returns nothing.

---

### U8. Small-zombie sweep: DebugInfoActivity and orphan layouts

**Goal:** Delete the remaining unreferenced/zombie UI leaves.

**Requirements:** R6

**Dependencies:** U5 (StreamSettings already being trimmed)

**Files:**
- Delete: `app/src/main/java/com/limelight/DebugInfoActivity.java`, `app/src/main/res/layout/activity_axitest.xml`, `app/src/main/res/layout/activity_game_display.xml`, `app/src/main/res/layout/activity_configure_virtual_controller.xml`
- Modify: `app/src/main/AndroidManifest.xml` (DebugInfoActivity entry)
- Modify: `app/src/main/java/com/limelight/preferences/StreamSettings.java` + `app/src/main/res/xml/preferences.xml` (the preference entry that launches it)
- Modify: `app/src/main/res/values*/strings.xml` (`debug_info_*` strings, all locales)

**Test scenarios:**
- Happy path: suite green; `LayoutInflationTest` reflects the shrunken `R.layout` set automatically (no hardcoded list — verified during investigation).
- Edge case: legacy StreamSettings screen opens without the removed entry.

**Verification:**
- Build + tests green; pre-existing Robolectric failure count is still exactly 5.

---

## Phased Delivery

- **Phase A (independent prep):** U1, U2 — can land in either order.
- **Phase B (Apollo plumbing):** U3 → U4 → U5. On-device smoke test after U5 (R7).
- **Phase C (feature demolition):** U6 → U7 → U8. Full on-device flow check after U8 (R7).
- **Phase 3 (not in this plan):** deferred mass deletion, see Scope Boundaries.

---

## System-Wide Impact

- **Interaction graph:** `Game`'s menu entry points (`showGameMenu` callers: perf-overlay tap, key/gesture handlers, Guide/Xbox and Start-hold handling) all collapse onto the Korri overlay; the obsolete native menu-option seam is gone.
- **Error propagation:** removing `UiHelper`'s vdisplay dialog eliminates one connection-failure branch; remaining stream-failure dialogs (including `HelpLauncher` troubleshooting) are untouched.
- **State lifecycle risks:** SharedPreferences contracts preserved — deleted pref keys are simply ignored on devices that have them; `specialPrefs` namespace literal is unchanged (R5).
- **API surface parity:** the kept shortcut ecosystem continues launching streams after the app-level virtual-display seam is removed; removed `Game` intent extras (`ServerCommands`) are no longer asserted by tests (checked in U4).
- **Integration coverage:** on-device smoke tests (R7) are the only proof for WebView-shell → Game → overlay wiring; unit tests cannot cover it.
- **Unchanged invariants:** `KorriShellActivity`, `KorriSettingsBridge` schema, `KorriGameOverlay`, `ServerHelper.createStartIntent` (simple overload), `ShortcutTrampoline` contract, `moonlight-core`, and all `StreamConfiguration` protocol defaults.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Removing a default string while locale translations remain breaks AAPT2 linking | Each unit sweeps `res/values*/strings.xml` for its strings in the same commit; build gate catches misses |
| Changing `specialPrefs`/`special_key` literals silently wipes users' keyboard configs | U2 relocates constants with values unchanged; verification greps for the literals |
| A `*IntentTest` may assert `EXTRA_SERVER_COMMANDS` | U4 checks first and removes the assertion in the same commit |
| Hidden resource references (layout `tools:context`, drawable-only refs) survive class deletion | Grep for the class/resource name across `app/src/main/res` before each deletion commit |
| Pre-existing 5 Robolectric failures mask new breakage | Record the failing-test list before Phase A; compare identical set after every unit |
| `Game.java` is edited by five units | Strict sequencing (U1→U3→U4→U5→U6→U7) keeps each diff reviewable |

---

## Documentation / Operational Notes

- Phase 3 unblocker captured as backlog item `01KYP3VP999A5G69S48S38TWFV` (in-shell pairing + host-add + `createAppListPoller` refresh).
- README cleanup captured as backlog item `01KYP3VXHWT1XYYPHKBQX6XXE9` after review found it still advertises deleted features.
- Shortcut-launch and Guide/Xbox overlay contract tests captured as backlog item `01KYP49M347QMV4TCTK86H1R2T` after review identified the retained paths as manual-only coverage.
- Transactional controller mouse-mode transitions captured as backlog item `01KYP54JTQKCGVQC768RMY3WRB`; a partial cleanup was deliberately reverted after review proved held/repeating/aggregated inputs require a coordinated state-machine fix.
- Deploy target for R7 checks: tablet (`adb-R52Y80L0GZB-JRmG8d._adb-tls-connect._tcp`), APK `app/build/outputs/apk/nonRoot_game/debug/app-nonRoot_game-arm64-v8a-debug.apk`, package `com.limelight.noirdebug`.

---

## Sources & References

- Origin: handoff document from the investigation session (2026-07-28); reachability analysis in-session.
- Related code: `app/src/main/java/com/limelight/KorriShellActivity.java`, `app/src/main/java/com/limelight/GameMenu.java`, `app/src/main/java/com/limelight/Game.java`, `app/src/main/java/com/limelight/utils/ServerHelper.java`
- Related commits: `11c9d31e` (TEMP debug commit), `0de7dafd` (Apollo settings dropped from schema)
