---
title: "refactor: Sweep remaining dead features from the Korri Artemis fork (zombies, OSC, accessibility service, Help, perf tracker, Profiles UI)"
type: refactor
status: completed
date: 2026-07-29
verify_command: "nix develop --command ./gradlew assembleNonRoot_gameDebug testNonRoot_gameDebugUnitTest --no-daemon"
---

# refactor: Sweep remaining dead features from the Korri Artemis fork

## Summary

Six atomic deletion units removing the post-demolition candidates the user confirmed: the two zero-reference zombies (`ByteBufferDescriptor`, `Game.toggleVirtualController()`), the three product-decision features (on-screen touch gamepad, `KeyboardAccessibilityService`, the embedded Help/web-link system), and the unblocked Phase-3-adjacent slice (Profiles UI, `PerformanceDataTracker`). The ProfilesManager settings-overlay engine, the virtual keyboard, and every Korri-schema-exposed feature are explicitly preserved.

---

## Problem Frame

The first demolition (`20260728-korri-dead-code-demolition`) removed the Apollo plumbing, external display, and native game menu. A post-completion candidate survey classified the remaining dead mass; the user selected buckets A (zombies), B (product decisions: drop touch gamepad, system-key capture, help links), and C (Phase-3-adjacent work that is deletable now with small edits to the still-present legacy surfaces). This plan executes that selection with the same additive-fork discipline.

---

## Requirements

- R1. Bucket-A zombies are removed: `ByteBufferDescriptor` (zero references) and the dead `Game.toggleVirtualController()` entry point.
- R2. The on-screen touch gamepad (OSC) is removed end to end: the `virtual_controller/` package excluding `keyboard/`, its `Game`/`ControllerHandler` branches, prefs (`checkbox_show_onscreen_controls`, `checkbox_only_show_L3R3`, `checkbox_vibrate_osc`, `checkbox_onscreen_style_official`, `seekbar_osc_opacity`), settings UI, strings, and OSC-only resources. The virtual keyboard (`keyboard/` subpackage, floating button, `toggleKeyboardController`) keeps working.
- R3. `KeyboardAccessibilityService` is removed: class, manifest service entry, `res/xml/keyboard_accessibility_service.xml`, and its strings.
- R4. The embedded Help system is removed: `HelpActivity`, `HelpLauncher`, the Help button on stream-error dialogs, `WebLauncherPreference` plus its four `preferences.xml` entries, manifest entry, layout, and strings.
- R5. `PerformanceDataTracker` is removed end to end: the tracker, the `Game` save hook, `prefConfig.enablePerfLogging`, the StreamSettings share/clear slice, `preferences.xml` entries, strings, and any decoder-latency helper methods left orphaned.
- R6. The Profiles UI is removed (`ProfilesActivity`, `EditProfileActivity`, `profiles/ProfilesAdapter`, layouts, manifest entries, PcView/AppView launch buttons, UI-only test files) while `ProfilesManager` and `SettingsProfile` — the prefs-overlay engine under `PreferenceConfiguration` — are preserved unchanged.
- R7. Every unit is one atomic commit that builds green and keeps `KorriSettingsBridgeTest` and all `*IntentTest` tests green. After the Profiles unit lands, the full-suite baseline shrinks: both `ProfilesNavigationTest` cases retire with their UI, and the `LayoutInflationTest` failure is expected to clear with the `profilesButton` widget (expected new baseline 2; U5 measures and records the actual count, which then holds for the remaining units).
- R8. No `moonlight-core`/JNI changes; the 38-key Korri settings schema is untouched.
- R9. Strings are removed across all locales (`res/values*/strings.xml`) in the same commit as their feature, preserving AAPT2 resource linking.

---

## Scope Boundaries

- No Phase-3 mass deletion: `PcView`, `AppView`, `StreamSettings`, `grid/`, `res/xml/preferences.xml`, `AddComputerManually`, and the OTP-pairing branch stay until in-shell pairing exists (backlog `01KYP3VP999A5G69S48S38TWFV`).
- The remaining custom preference widgets (`SeekBarPreference`, `SmallIconCheckboxPreference`, `LanguagePreference`) stay — `preferences.xml` inflates them 20+ times; they go with the Phase-3 `preferences.xml` deletion. Only `WebLauncherPreference` is deleted here (its four XML entries are help links removed by R4).
- The manifest `FileProvider` stays — StreamSettings keyboard-config export still uses it after the perf-share path is deleted.
- No fixes for the 3 remaining baseline failures (`LayoutInflationTest`, the two startup tests).
- No changes to the four existing backlog items (in-shell pairing, README cleanup, shortcut/overlay contract tests, transactional mouse-mode transitions).
- No release-build/APK-size measurement — debug APK only.

### Deferred to Follow-Up Work

- Phase-3 mass deletion and its unblocker contract: tracked in backlog `01KYP3VP999A5G69S48S38TWFV`.
- README/documentation repair for removed features: tracked in backlog `01KYP3VXHWT1XYYPHKBQX6XXE9`; this sweep's removals should be folded into that item's scope when it executes.

---

## Context & Research

### Relevant Code and Patterns

Reachability verified in-session (2026-07-28/29):

- `app/src/main/java/com/limelight/nvstream/av/ByteBufferDescriptor.java` has zero references in Java, resources, or manifest.
- `Game.toggleVirtualController()` has zero callers; the Korri overlay only calls `toggleKeyboardController()`.
- The `keyboard/` subpackage is functionally independent of the root `virtual_controller` package — its element base class (`keyBoardVirtualControllerElement`) and state do not use the root classes — but three keyboard files carry **stale unused imports** of them (`KeyAnalogStick.java:13`, `KeyBoardDigitalButton.java:15–16`, `keyBoardVirtualControllerElement.java:19` import `VirtualController`/`VirtualControllerElement`). U6 must strip these imports before deleting the root classes or the keyboard package will not compile.
- OSC is gated on `checkbox_show_onscreen_controls` (default `false`, absent from the Korri schema); its only enable path is legacy StreamSettings. Consumers: `Game` (`initVirtualController`, show/hide/refresh branches, `ControllerMode` check ~line 3018), `ControllerHandler` (~lines 386–401, 1077, 2220), `VirtualControllerConfigurationLoader`, StreamSettings `category_onscreen_controls` wiring (~lines 340, 407), `preferences.xml` OSC section (~lines 609–680).
- `KeyboardAccessibilityService` is opt-in via Android system accessibility settings only; nothing in-app references it. It forwards system-intercepted keys to `Game.instance` (which stays — the live keyboard classes use it).
- Help reachability: `Dialog.java:92` (`launchTroubleshooting` from stream-error dialogs), `PcView` setup-guide/EOL-FAQ calls (surfaces slated for Phase-3), and `WebLauncherPreference` (four `preferences.xml` entries at ~lines 891, 959, 966, 973 — all Artemis wiki/release URLs).
- `PerformanceDataTracker` write path: `Game.java:1912` gated on `prefConfig.enablePerfLogging` (default `false`, absent from Korri schema). Read path: StreamSettings `share_performance_logs` + `checkbox_enable_perf_logging` listeners (~lines 711–800). `MediaCodecDecoderRenderer` also reads `prefs.enablePerfLogging` in its stats-window condition (~line 1774, `prefs.enablePerfOverlay || prefs.enablePerfLogging`); its `performanceWasTracked()`/`getMinDecoderLatency()`/`getMinDecoderLatencyFullLog()` helpers have no consumers outside the `Game` save hook.
- Profiles: UI is reachable only from `PcView.java:184` and `AppView.java:316` buttons, backed by `profilesButton` `ExtendedFloatingActionButton` declarations in `res/layout/activity_app_view.xml`, `res/layout/activity_pc_view.xml`, and `res/layout-land/activity_pc_view.xml`. That widget is the source of the current `LayoutInflationTest` failure (inflation error at `activity_app_view.xml` line 45) as well as both `ProfilesNavigationTest` cast failures. The engine (`ProfilesManager.getOverlayingSharedPreferences`) is load-bearing in `PreferenceConfiguration`, `ArtemisApplication`, and `Game`. Test split: `ProfilesNavigationTest` + `ProfilesActivityUiTest` exercise the UI (the former contributes 2 of the 5 baseline failures); `ProfilesManagerTest`, `OverlayPreferencesTest`, `ProfilesOverlayTest` exercise the kept engine.
- Prior-plan conventions to mirror: per-bucket atomic commits, all-locale string sweeps, grep-clean verification, `LayoutInflationTest` reflects over all `R.layout` fields so orphan layouts must be deleted with their code.

### Institutional Learnings

- None available (`docs/solutions/` does not exist in this fork).

---

## Key Technical Decisions

- **Keep the ProfilesManager engine, delete only the UI:** `getOverlayingSharedPreferences` is the read path for every preference in the app. Deleting the editing UI leaves stored profiles active but frozen — the retained engine keeps reading and applying them; users simply lose the ability to edit them. Ripping out the engine would be a high-risk refactor for zero demolition value. Same relocate-vs-delete discipline as the GameMenu constants in the prior plan.
- **`WebLauncherPreference` goes with Help, other widgets stay:** it exists solely to launch help URLs and has exactly four XML consumers, all being deleted. `SeekBarPreference`/`SmallIconCheckboxPreference`/`LanguagePreference` have 20+ live inflation sites and belong to the Phase-3 `preferences.xml` deletion.
- **Remove the Help button from stream-error dialogs rather than keep a stub:** with `HelpActivity` gone there is nothing to launch; a dead button is worse than none. The dialogs keep their message and dismiss action.
- **Delete decoder perf-report helpers only if orphaned:** the perf overlay uses separate stats; the execution-time grep decides whether `performanceWasTracked`/`getMinDecoderLatency*` go with U3 or stay.
- **OSC lands last:** it is the largest unit (~2,800 LOC) and touches the same shared files (`Game`, `ControllerHandler`, `StreamSettings`, `preferences.xml`) as smaller units; sequencing it last keeps earlier diffs reviewable.
- **Baseline contract tightens mid-plan, and “green” is baseline-relative:** throughout this plan, “build + tests green” means the targeted Korri gates (`KorriSettingsBridgeTest`, all `*IntentTest`) pass and the full-suite failure count exactly matches the phase baseline — the full `testNonRoot_gameDebugUnitTest` task is expected to exit non-zero while baseline failures exist, so verification parses results rather than trusting the exit code. Units before U5 verify against the 5-failure baseline; units from U5 onward verify against the post-U5 baseline established by U5's measurement (expected 2–3; see U5).

---

## Open Questions

### Resolved During Planning

- Does deleting OSC break the virtual keyboard? **No** — verified zero imports from `keyboard/` into the root `virtual_controller` package.
- Are the custom preference widgets deletable now? **Only `WebLauncherPreference`** — the rest have live `preferences.xml` inflation sites.
- Does `FileProvider` survive perf-share deletion? **Yes** — keyboard-config export in StreamSettings still uses it.

### Deferred to Implementation

- Exact OSC drawable/layout/string resource list — enumerate by grep when deleting, as with prior units.
- Whether `MediaCodecDecoderRenderer` perf-report helpers are orphaned after U3 — grep at execution time.
- Whether `Game`'s `oscOpacity`/`vibrateOsc`-adjacent fields have secondary consumers (e.g., keyboard vibration path reuses `vibrateOsc`) — verify before deleting each pref read; any shared read stays.

---

## Implementation Units

### U1. Delete confirmed zombies

**Goal:** Remove the two zero-reference items with no product implications.

**Requirements:** R1, R7

**Dependencies:** None

**Files:**
- Delete: `app/src/main/java/com/limelight/nvstream/av/ByteBufferDescriptor.java`
- Modify: `app/src/main/java/com/limelight/Game.java` (remove `toggleVirtualController()`)

**Approach:**
- Pure deletion; `toggleVirtualController` mutated `prefConfig.onscreenController`, but no caller exists, so no behavior changes.

**Test scenarios:**
- Test expectation: none — zero-reference deletions; the compile plus existing suite green is the gate.

**Verification:**
- Build green; `rg "ByteBufferDescriptor|toggleVirtualController"` in `app/src` returns nothing; full-suite baseline unchanged at 5.

---

### U2. Delete KeyboardAccessibilityService

**Goal:** Remove the opt-in system-key capture service.

**Requirements:** R3, R7, R9

**Dependencies:** None

**Files:**
- Delete: `app/src/main/java/com/limelight/KeyboardAccessibilityService.java`, `app/src/main/res/xml/keyboard_accessibility_service.xml`
- Modify: `app/src/main/AndroidManifest.xml` (service entry ~line 247), `app/src/main/res/values*/strings.xml` (`accessibility_description_text` and related, all locales)

**Approach:**
- `Game.instance`/`handleKeyDown`/`handleKeyUp` stay — the live keyboard controllers use them.

**Test scenarios:**
- Edge case: `rg -i "accessibility" app/src/main` returns only unrelated framework attributes, no app service references.
- Happy path: suite green; APK installs (manifest still valid).

**Verification:**
- Build + tests green; no accessibility service is declared in the merged manifest.

---

### U3. Delete PerformanceDataTracker end to end

**Goal:** Remove the benchmark logbook: write path, read/share UI, pref, and strings.

**Requirements:** R5, R7, R9

**Dependencies:** None (touches `Game`, `StreamSettings`, `preferences.xml` before U4/U6 rework the same files)

**Files:**
- Delete: `app/src/main/java/com/limelight/utils/PerformanceDataTracker.java`
- Modify: `app/src/main/java/com/limelight/Game.java` (save block ~line 1912), `app/src/main/java/com/limelight/preferences/PreferenceConfiguration.java` (`enablePerfLogging` key/field/read), `app/src/main/java/com/limelight/preferences/StreamSettings.java` (perf-logging change listener, `share_performance_logs` handler), `app/src/main/res/xml/preferences.xml` (`checkbox_enable_perf_logging`, `share_performance_logs` entries), `app/src/main/res/values*/strings.xml` (perf-logging/email strings, all locales)
- Modify (required): `app/src/main/java/com/limelight/binding/video/MediaCodecDecoderRenderer.java` (drop `enablePerfLogging` from the stats-window condition ~line 1774 so it reads `prefs.enablePerfOverlay` only; additionally remove `performanceWasTracked`/`getMinDecoderLatency`/`getMinDecoderLatencyFullLog` and their backing state if grep confirms they are orphaned after the `Game` hook is gone)

**Approach:**
- Keep the `FileProvider` manifest entry (settings export uses it). Stale `performance_log` SharedPreferences entries on-device are simply ignored.

**Test scenarios:**
- Edge case: `rg "PerformanceDataTracker|enablePerfLogging|performance_log|share_performance_logs"` in `app/src/main` returns nothing.
- Happy path: suite green; `KorriSettingsBridgeTest` unchanged (schema never exposed perf logging).
- Integration: legacy StreamSettings still opens without the removed preferences present.

**Verification:**
- Build + tests green; baseline still 5.

---

### U4. Delete the Help system

**Goal:** Remove the embedded web-help surface and all launch paths into it.

**Requirements:** R4, R7, R9

**Dependencies:** U3 (sequencing on `StreamSettings`/`preferences.xml`)

**Files:**
- Delete: `app/src/main/java/com/limelight/HelpActivity.java`, `app/src/main/java/com/limelight/utils/HelpLauncher.java`, `app/src/main/java/com/limelight/preferences/WebLauncherPreference.java`
- Modify: `app/src/main/AndroidManifest.xml` (HelpActivity entry ~line 236), `app/src/main/java/com/limelight/utils/Dialog.java` (help button on error dialogs ~line 92), `app/src/main/java/com/limelight/PcView.java` (setup-guide, GameStream-EOL-FAQ, management-URL calls), `app/src/main/res/xml/preferences.xml` (four `WebLauncherPreference` entries ~lines 891, 959, 966, 973), `app/src/main/res/values*/strings.xml` (help/link summaries, `obtainium_app_url`, all locales), plus the HelpActivity layout if one exists (enumerate at execution)
- Test: existing suite (no direct Help coverage exists)

**Approach:**
- Error dialogs keep message + dismiss; the help affordance is removed rather than stubbed. PcView keeps compiling with its help menu items removed (PcView itself is Phase-3).

**Test scenarios:**
- Edge case: `rg "HelpActivity|HelpLauncher|WebLauncherPreference"` in `app/src/main` returns nothing.
- Happy path: suite green; stream-error `Dialog` construction paths still compile and display.
- Integration: legacy StreamSettings opens with the help/link entries gone.

**Verification:**
- Build + tests green; baseline still 5.

---

### U5. Delete the Profiles UI, keep the engine

**Goal:** Remove profile-editing surfaces while preserving the prefs-overlay engine every preference read depends on.

**Requirements:** R6, R7, R9

**Dependencies:** None (independent of U3/U4 file overlap; touches `PcView`/`AppView` only at button sites)

**Files:**
- Delete: `app/src/main/java/com/limelight/ProfilesActivity.java`, `app/src/main/java/com/limelight/EditProfileActivity.java`, `app/src/main/java/com/limelight/profiles/ProfilesAdapter.java`, `app/src/main/res/layout/activity_profiles.xml`, `app/src/main/res/layout/activity_edit_profile.xml`, `app/src/main/res/layout/row_profile.xml`, `app/src/test/java/com/limelight/profiles/ProfilesNavigationTest.java`, `app/src/test/java/com/limelight/profiles/ProfilesActivityUiTest.java`
- Modify: `app/src/main/AndroidManifest.xml` (both activity entries), `app/src/main/java/com/limelight/PcView.java` (profiles button ~line 184, active-profile label if UI-only), `app/src/main/java/com/limelight/AppView.java` (profiles button ~line 316, active-profile label if UI-only), `app/src/main/res/layout/activity_app_view.xml` + `app/src/main/res/layout/activity_pc_view.xml` + `app/src/main/res/layout-land/activity_pc_view.xml` (remove the `profilesButton` `ExtendedFloatingActionButton` declarations and any layout references anchored to them), `app/src/main/res/values*/strings.xml` (profile-editor strings without live consumers, all locales), `app/src/main/res/drawable*/ic_profiles*` (delete if unconsumed after button removal)
- Keep: `app/src/main/java/com/limelight/profiles/ProfilesManager.java`, `app/src/main/java/com/limelight/profiles/SettingsProfile.java`, `app/src/test/java/com/limelight/profiles/ProfilesManagerTest.java`, `app/src/test/java/com/limelight/profiles/OverlayPreferencesTest.java`, `app/src/test/java/com/limelight/profiles/ProfilesOverlayTest.java`

**Approach:**
- `ProfilesManager.getActiveName()` display strings in PcView/AppView: keep the read if the label remains, otherwise remove label + read together — decide at the diff, biasing toward the smaller change.
- Deleting `ProfilesNavigationTest` retires 2 of the 5 baseline failures by removing their subject, not by suppressing real coverage — the surviving engine tests still cover `ProfilesManager`.
- Removing the `profilesButton` widget from the three layouts likely also retires the `LayoutInflationTest` failure, whose recorded inflation error points at that widget in `activity_app_view.xml`. Measure the post-U5 baseline from the actual run (expected 2, possibly 3 if another inflation error is masked behind the current one) and record it as the contract for U6 onward.

**Test scenarios:**
- Happy path: engine tests (`ProfilesManagerTest`, `OverlayPreferencesTest`, `ProfilesOverlayTest`) still pass; `KorriSettingsBridgeTest` unchanged (settings still read through the overlay).
- Edge case: `rg "ProfilesActivity|EditProfileActivity|ProfilesAdapter"` in `app/src` returns nothing.
- Integration: full suite reports both startup-test failures, no `ProfilesNavigationTest` entries, and `LayoutInflationTest` passing unless a previously-masked inflation error surfaces — record the measured count as the new baseline.

**Verification:**
- Build + targeted tests green; full-suite baseline measured and recorded (expected 2); on-device prefs still resolve (any smoke that launches `KorriShellActivity` suffices).

---

### U6. Delete the on-screen touch gamepad (OSC)

**Goal:** Remove the touch-gamepad feature package and every branch serving it, leaving the virtual keyboard intact.

**Requirements:** R2, R7, R9

**Dependencies:** U1 (Game.java sequencing), U3/U4 (StreamSettings/`preferences.xml` sequencing), U5 (baseline contract now 3)

**Files:**
- Delete: `app/src/main/java/com/limelight/binding/input/virtual_controller/` root classes (`VirtualController.java`, `VirtualControllerConfigurationLoader.java`, `VirtualControllerElement.java`, `AnalogStick.java`, `AnalogStickFree.java`, `DigitalButton.java`, `DigitalPad.java`, and siblings — enumerate at execution; `keyboard/` subpackage stays), `app/src/main/java/com/limelight/preferences/ConfirmDeleteOscPreference.java` (OSC-only widget; `ConfirmDeleteKeyboardPreference` stays)
- Modify: `app/src/main/java/com/limelight/Game.java` (OSC init/show/hide/refresh branches, `ControllerMode` touch check ~line 3018), `app/src/main/java/com/limelight/binding/input/ControllerHandler.java` (`onscreenController` branches ~lines 386–401, 1077, 2220), `app/src/main/java/com/limelight/binding/input/virtual_controller/keyboard/KeyAnalogStick.java` + `KeyBoardDigitalButton.java` + `keyBoardVirtualControllerElement.java` (strip the stale `VirtualController`/`VirtualControllerElement` imports), `app/src/main/java/com/limelight/preferences/PreferenceConfiguration.java` (`onscreenController`, `onlyL3R3`, `vibrateOsc`, `enableOnScreenStyleOfficial`, `oscOpacity` keys/fields/reads — retaining any read shared with the keyboard path), `app/src/main/java/com/limelight/preferences/StreamSettings.java` (`category_onscreen_controls` wiring), `app/src/main/res/xml/preferences.xml` (OSC section; retitle the kept `checkbox_vibrate_keyboard` entry ~line 718, which currently reuses `@string/title_checkbox_vibrate_osc`, to a keyboard-owned string before the OSC string sweep), `app/src/main/res/values*/strings.xml` (OSC strings, all locales), OSC-only drawables/layouts (enumerate at execution)

**Approach:**
- Strip the three stale keyboard imports first, then delete the root classes; after deletion, `rg "virtual_controller\.[A-Z]"` across `app/src/main` (including `keyboard/`) must return nothing.
- Before deleting each pref read, grep for shared consumers (e.g., confirm `vibrateOsc` is not reused by keyboard vibration); shared reads stay per R2's keyboard guarantee.

**Test scenarios:**
- Happy path: suite green at the 3-failure baseline; `KorriSettingsBridgeTest` unchanged.
- Edge case: `rg -i "onscreen_controls|show_onscreen|only_show_L3R3|vibrate_osc|osc_opacity|onscreen_style_official"` in `app/src/main` returns nothing.
- Integration: on-device stream launch works; floating button still toggles the virtual keyboard; Guide/Xbox still opens the Korri overlay.
- Error path: legacy StreamSettings opens without the OSC category present.

**Verification:**
- Build + tests green; on-device keyboard/overlay smoke passes; grep-clean for OSC symbols outside `keyboard/`.

---

## System-Wide Impact

- **Interaction graph:** `Game.java` is touched by U1/U3/U6 and `StreamSettings`/`preferences.xml` by U3/U4/U6 — sequential landing keeps each diff attributable. No receiver/service remains for deleted manifest entries.
- **Error propagation:** stream-error dialogs lose only their Help affordance; message and dismiss behavior are unchanged (U4).
- **State lifecycle risks:** stale on-device SharedPreferences (`performance_log`, OSC keys, profile store) become inert; the profile store keeps being read by the retained engine, which is the intended behavior.
- **API surface parity:** the Korri schema, shortcut ecosystem, and JNI surface are untouched; no `Game` intent extras change, so `*IntentTest`s stay valid without edits.
- **Integration coverage:** the keyboard-stays guarantee (R2) is proven by on-device floating-button smoke plus the post-deletion grep showing no root-`virtual_controller` references anywhere (the keyboard's prior imports were stale and are stripped in U6), since no automated test covers the virtual keyboard.
- **Unchanged invariants:** `ProfilesManager.getOverlayingSharedPreferences` remains the single read path for all preferences; `MoonBridge` native declarations and `StreamConfiguration` protocol defaults are untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| A "shared" pref read (e.g., `vibrateOsc`) secretly serves the keyboard path | Per-pref consumer grep before deletion; shared reads stay (R2) |
| Deleting profile strings breaks a live consumer in kept surfaces | Same all-locale, grep-before-delete string discipline as the prior plan (R9) |
| Baseline drift confuses verification mid-plan | Explicit contract: 5 failures through U4; U5 measures and records the new baseline (expected 2) for U6 onward (R7) |
| OSC deletion misses a resource and breaks AAPT2 or `LayoutInflationTest` | Delete layouts/drawables with their code in the same commit; `LayoutInflationTest` reflects all remaining layouts |
| PcView/AppView edits collide with future Phase-3 deletion | Edits are button-removal-only; Phase-3 deletes the whole files regardless |

---

## Sources & References

- Predecessor plan: [work/items/active/20260728-korri-dead-code-demolition/plan.md](../20260728-korri-dead-code-demolition/plan.md)
- Backlog: `work/items/parking-lot/01KYP3VP999A5G69S48S38TWFV-add-in-shell-pairing-host-add-and-app-list-refresh.md`, `work/items/parking-lot/01KYP3VXHWT1XYYPHKBQX6XXE9-update-readme-for-korri-feature-removals.md`
- Key code: `app/src/main/java/com/limelight/Game.java`, `app/src/main/java/com/limelight/preferences/PreferenceConfiguration.java`, `app/src/main/java/com/limelight/profiles/ProfilesManager.java`, `app/src/main/res/xml/preferences.xml`
