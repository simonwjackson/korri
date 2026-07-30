---
id: 01KYTECFJ2BARWPV834DRFTEGX
slug: spike-mdns-discovery-on-android-before-building-peer-discove
title: Spike mDNS discovery on Android before building peer discovery
origin: parked
status: To Do
priority: low
labels:
  - korrid
  - android
  - discovery
  - networking
  - spike
created: 2026-07-30
source: se-work
---

# Spike mDNS discovery on Android before building peer discovery

## Why it matters

Peer addresses are configuration today (aka and zao are hardcoded in the upstream registry), which does not survive contact with a real network or a second user. Discovery is the obvious fix, but Android is hostile to multicast in specific ways: it requires holding a MulticastLock, Wi-Fi power save silently drops multicast packets when the screen is off, and behaviour varies by vendor. Building a discovery slice without knowing which of these bite would risk a feature that works on the bench and fails in the living room. Deliberately deferred until discovery is actually the next slice — capturing it so the hazards are not rediscovered from scratch.

## Acceptance Criteria

- [ ] Known whether mDNS browse/advertise works from the Korri app on the tablet with MulticastLock held, and what happens without it
- [ ] Behaviour recorded with the screen off and under Wi-Fi power save
- [ ] Known whether a Linux peer running korrid can be discovered from the tablet and vice versa on the real home network
- [ ] Decision recorded on whether discovery replaces or merely supplements configured peers

## Related

- `services/korrid/src/upstreams.rs`
- `services/korrid/deploy/upstreams.android.json`

## Notes

Do not start until discovery is genuinely the next slice; this is a hazard record, not a queued task. Note aka and zao currently reach each other over Tailscale (100.x addresses), which mDNS does not cross — so discovery may be LAN-only and Tailscale peers stay configured regardless.
