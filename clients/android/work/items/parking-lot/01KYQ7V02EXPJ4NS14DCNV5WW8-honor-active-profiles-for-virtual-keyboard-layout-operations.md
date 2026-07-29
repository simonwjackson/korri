---
id: 01KYQ7V02EXPJ4NS14DCNV5WW8
slug: honor-active-profiles-for-virtual-keyboard-layout-operations
title: Honor active profiles for virtual-keyboard layout operations
origin: parked
status: To Do
priority: medium
labels:
  - profiles
  - virtual-keyboard
  - preferences
  - bug
created: 2026-07-29
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/artemis
  branch: spike/korri-shell-webview
  commit: 5df2e338d6d9
  repo: artemis
  invoked_by: se-work U6 final review
---

# Honor active profiles for virtual-keyboard layout operations

## Why it matters

Focused U6 review confirmed a pre-existing profile-boundary mismatch: runtime settings use ProfilesManager overlays, but virtual-keyboard layout load/save/reset/import/export resolve keyboard_axi_list from base SharedPreferences. An active profile can therefore name one keyboard layout while the runtime and management operations use another.

## Acceptance Criteria

- [ ] Virtual-keyboard runtime layout selection resolves keyboard_axi_list through the active profile overlay.
- [ ] Save, reset, import, and export consistently target the same resolved layout as runtime loading.
- [ ] Base preferences remain unchanged when a profile-only layout selection is active unless the user explicitly edits base settings.
- [ ] Tests cover differing base/profile keyboard_axi_list values and verify operations target the profiled layout.

## Related

- `app/src/main/java/com/limelight/binding/input/virtual_controller/keyboard/KeyBoardControllerConfigurationLoader.java`
- `app/src/main/java/com/limelight/preferences/ConfirmDeleteKeyboardPreference.java`
- `app/src/main/java/com/limelight/preferences/StreamSettings.java`
- `app/src/main/java/com/limelight/profiles/ProfilesManager.java`

## Notes

Confirmed pre-existing during OSC demolition; constant renaming did not introduce the mismatch.
