---
id: 01KVR91ZMMKK1A4PV65HFM7CNJ
slug: validate-yfs-chromium-under-remap-native-runner
title: Validate YFS Chromium under Remap native runner
origin: parked
status: To Do
priority: high
labels:
  - remap
  - yfs
  - browser-runtime
  - sobo
created: 2026-06-22
source: user
---

# Validate YFS Chromium under Remap native runner

## Why it matters

After the Remap setuid policy transport is fixed, YFS still needs browser-specific validation because Remap native wrapper runs yfs-launch/Chromium as korri-remap-runner and hides synthetic keyboard/gamepad devices from Sway. YFS previously relied on Chromium receiving keyboard input in the Korri compositor session, so storage, display-socket, and DOM input delivery may need explicit design.

## Acceptance Criteria

- [ ] A Sobo launch of yfs-sewer-you-next-summer through @korri:remap reaches __YFS_DIRECT_LAUNCH.status = ready.
- [ ] The wrapped yfs-launch can read the level file and create/use its prepared-root cache without relying on /home/korri private directories.
- [ ] Chromium can connect to the required display/session resources as the launch identity, or the Remap design is adjusted with a documented safe alternative.
- [ ] Physical controller input produces the intended YFS keyboard actions in gameplay without leaking synthetic events to Korri home/Sway after session cleanup.

## Related

- `product/plugins/yoshis-fabrication-station/src/launcher/yfs-launch.ts`
- `product/plugins/webpage/src/runtime/webpage.ts`
- `product/plugins/remap/packages/korri-remap-bridge/native-driver.py`
- `work/items/active/01KVPDA9QGRW0ZHJFBQ1V0V6GA-refactor-remap-launch-companion/plan.md`

## Notes

During Sobo experiment, additional likely blockers were observed: /home/korri/.cache/korri/yfs-launch and /run/user/2000 are 0700 owned by korri, while the Remap native driver runs the child via setpriv as korri-remap-runner. Also validate whether hidden synthetic keyboard devices can generate DOM key events for Chromium/YFS or whether browser games need a different Remap sink.
