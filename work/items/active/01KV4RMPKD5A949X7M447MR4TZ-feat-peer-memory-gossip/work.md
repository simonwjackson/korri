---
id: 01KV4RMPKD5A949X7M447MR4TZ
title: "feat: Remember discovered peers and gossip fleet membership"
status: active
created: 2026-06-14
source: direct-prompt
---

# feat: Remember discovered peers and gossip fleet membership

Plan created from an in-session design discussion about making Korri peer
discovery work across networks (home LAN + Tailscale/overlay) without a
hand-maintained peer list and without coupling to any specific transport.

Builds on the committed change `fix(discovery): address discovered peers by
hostname, not LAN IP` (`3444681`), which made peer `controlUrl`s name-based so
a peer is reachable wherever its name resolves. This work adds the discovery
half: persistent peer memory plus gossip so the fleet remembers itself.
