---
id: 01KYP3VP999A5G69S48S38TWFV
slug: add-in-shell-pairing-host-add-and-app-list-refresh
title: Add in-shell pairing, host-add, and app-list refresh
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - dead-code
  - shell
  - pairing
created: 2026-07-29
source: se-work
context:
  cwd: /home/simonwjackson/code/sandbox/artemis
  branch: spike/korri-shell-webview
  commit: 3b81cf1514b1
  repo: artemis
  invoked_by: dead-code demolition plan
---

# Add in-shell pairing, host-add, and app-list refresh

## Why it matters

The Korri shell still depends on legacy PcView/AppView/StreamSettings escape hatches for pairing and host management. Building the native shell bridge for PairingManager plus ComputerManagerService app-list polling unlocks the deferred Phase-3 mass deletion without breaking shortcut and .art launch flows.

## Acceptance Criteria

- [ ] Korri shell can add a host and complete pairing without opening PcView or AddComputerManually.
- [ ] Korri shell can refresh the selected host's app list via ComputerManagerService.ComputerManagerBinder.createAppListPoller.
- [ ] ShortcutTrampoline, pinned shortcuts, TV channels, and .art launch/export contracts are explicitly preserved or migrated.
- [ ] PcView, AppView, StreamSettings, grid UI, profile UI, custom preference widgets, and obsolete XML resources can be deleted with build, unit, and paired-device smoke verification.

## Related

- `work/items/active/20260728-korri-dead-code-demolition/plan.md`
- `app/src/main/java/com/limelight/KorriShellActivity.java`
- `app/src/main/java/com/limelight/computers/ComputerManagerService.java`
- `app/src/main/java/com/limelight/ShortcutTrampoline.java`
