---
id: 01KYTRAQKDC4RDGJHBNKRETMA6
slug: build-com-korri-retroarch-fork-as-a-first-class-local-emulat
title: Build com.korri.retroarch fork as a first-class local emulation transport
origin: parked
status: To Do
priority: medium
labels:
  - android
  - retroarch
  - emulation
  - transport
  - fork
  - korri-shell
created: 2026-07-31
source: se-brainstorm
context:
  cwd: artemis
  branch: custom
  commit: cf12c432
  repo: artemis
  invoked_by: user
---

# Build com.korri.retroarch fork as a first-class local emulation transport

## Why it matters

The stock-RetroArch spike proved the local-emulation transport works end-to-end (Wario Land 4 booted invisibly from a Korri intent, saves landed in a Korri-owned tree), but every capability gap discovered resolved to the same fix: fork RetroArch. Stock RA ships zero cores in the 184 MB buildbot APK, segfaults on this hardware with its default Vulkan driver, has no command interface compiled in at all (verified: 2,710 verbose log lines, zero network mentions), cannot report session state, and cannot savestate on pause. Worst of all, our own kiosk lockdown makes RA's only working auto-savestate trigger permanently unreachable — so today local play has SRAM-only persistence and no frame-exact resume. One fork (~a day against RA's Android build) unlocks seven capabilities at once and converts RA from a cooperating stranger into a real Korri transport with the same session semantics as the aka stream path.

## Acceptance Criteria

- [ ] Cores bundled in the APK and extracted on first run — no manual 'Install or Restore a Core' UI safari, no per-core provisioning step
- [ ] No launcher icon (preserves the single-visible-app property already achieved for Artemis)
- [ ] GL video driver as default (stock Vulkan default SIGSEGVs on Mali/Immortalis — verified crash in font_driver_init_first on Tab S10 Ultra)
- [ ] Command interface compiled in: GET_STATUS returns playing/paused plus content identity
- [ ] Session lifecycle events emitted on activity start/stop so the shell and korrid observe local sessions the same way they observe aka's
- [ ] Graceful QUIT reachable from the Korri overlay/shell so savestate_auto_save actually fires, and savestate_auto_load resumes frame-exact on next launch
- [ ] State-on-pause: onPause() triggers a synchronous CMD_EVENT_SAVE_STATE
- [ ] ACTION_SHUTDOWN receiver forces a final SRAM + state flush (insurance against OEM shutdown ordering)
- [ ] Optional: periodic savestate cadence to bound loss on hard power cut / battery pull
- [ ] Launch path from the Korri shell unchanged from the caller's perspective (same bridge method, new package name)

## Related

- `app/src/main/java/com/limelight/KorriShellActivity.java`
- `app/src/main/assets/korri-shell/index.html`

## Notes

## Spike status this builds on

Working today with STOCK RetroArch 1.22.2 (`com.retroarch.aarch64`, buildbot) driven by intent from `KorriShellActivity.launchLocalRetro()` (already committed on `custom`):
- WL4 boots straight to gameplay, zero RA UI visible (kiosk config)
- SRAM lands in the Korri tree and flushes every 10s
- RA suspends on background and resumes in place (after QUITFOCUS was removed)

## Verified facts (do not re-derive)

- **Buildbot APK contains NO cores** — only `assets/info/*.info` and shaders. Confirmed by unzipping the APK. RA's own Play Store flavor *does* bundle cores and self-extracts, which is the precedent for doing this in our fork.
- **Vulkan default crashes on this device**: `SIGSEGV` in `font_driver_init_first` during `drivers_init` → `retroarch_main_init`. `video_driver = "gl"` fixes it. This alone justifies owning the config/build — stock users would just see "app is broken."
- **No command interface in the Android build**: verbose logging produced 2,710 RetroArch lines with zero `network`/`cmd` matches, and nothing bound on UDP 55355. `network_cmd_enable` is a no-op in this binary. So GET_STATUS/QUIT require the fork, not config.
- **Auto-savestate matrix** (empirically tested):
  - periodically → does not exist (`autosave_interval` is SRAM-only)
  - on switch-out/background → nothing written (tested: process alive, states dir empty)
  - on graceful quit → works, but unreachable under our kiosk lockdown (menu locked, hotkey unbound, network cmd absent)
  - on process kill → nothing
- **onPause lifecycle coverage** (for the state-on-pause hook): screen off ✅, user power-off ✅ (ACTION_SHUTDOWN contract pauses the foreground activity), OS low-battery shutdown ✅, physical battery death ❌. A dying device typically passes through screen-off *and* battery-shutdown, so expect two saves on the way down.
- Savestate write must be **synchronous** in onPause (pause work must complete before Android proceeds). GBA states are a few hundred KB; PSX a few MB — both fit comfortably.

## Licensing

RetroArch is GPL — forking and redistributing a modified build is explicitly permitted. Same license family as the Artemis fork already maintained.

## Scope interaction with the overlay service

If the universal Korri overlay service (separate backlog item) lands first, this fork does NOT need its own in-process overlay — overlay burden moves to the system-overlay service and this fork keeps only what a fork uniquely enables (cores, icon, GL default, command channel, lifecycle events, state-on-pause).

## Provisioning knowledge that becomes obsolete once this lands

The manual core-install flow (Load Core → Install or Restore a Core → file browser) and the Samsung/FUSE gotcha where adb-pushed files are invisible to RA until permissions settle. Both disappear when cores ship inside the APK.
