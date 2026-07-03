---
id: 01KWJF5YGH17J142PK7NCTD4R3
slug: bandai-accepts-remote-stream-launch-but-never-spawns-moonlig
title: Bandai accepts remote-stream launch but never spawns Moonlight (post-reboot)
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - bandai
  - streaming
  - sessiond
  - moonlight
  - reliability
created: 2026-07-02
source: se-debug
---

# Bandai accepts remote-stream launch but never spawns Moonlight (post-reboot)

## Why it matters

After a Bandai reboot, firing app.library.launch for a remote aka source returns Accepted/launched from Bandai korrid, but Bandai never spawns the gamescope+moonlight foreground session, so aka's prepared stream intent is written but never claimed (aka stays idle). The same launch path streamed successfully earlier in the session, so this is an intermittent Bandai session-lifecycle/bring-up failure. Bandai's user journal returns no entries (see 01KTSGMPVYJYJCVG9QXHWQK9J5), so the spawn failure is currently unobservable. Overlaps the streaming-reliability cluster (hub recovery 01KWGHX442, korrid HTTP deadlock 01KTWY29QX). Blocks live end-to-end stream verification.

## Acceptance Criteria

- [ ] Root-cause why an Accepted remote-stream launch does not spawn moonlight on Bandai after reboot
- [ ] Bandai reliably spawns the gamescope+moonlight session (or surfaces a visible error) on remote-source launch
- [ ] aka's prepared intent is claimed and the stream renders end-to-end

## Related

- `product/apps/portal/stream/moonlight-launcher.ts`
- `product/services/device/sessiond.ts`
- `01KWGHX442E8ZNEYWA16E1VZAK`
- `01KTWY29QXETY32M6G4MAZ9CAZ`
- `01KTSGMPVYJYJCVG9QXHWQK9J5`
