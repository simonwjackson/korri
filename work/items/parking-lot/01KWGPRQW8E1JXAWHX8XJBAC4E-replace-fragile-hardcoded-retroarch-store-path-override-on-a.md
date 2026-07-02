---
id: 01KWGPRQW8E1JXAWHX8XJBAC4E
slug: replace-fragile-hardcoded-retroarch-store-path-override-on-a
title: Replace fragile hardcoded retroarch store-path override on aka
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - aka
  - retroarch
  - tech-debt
created: 2026-07-02
source: se-work
---

# Replace fragile hardcoded retroarch store-path override on aka

## Why it matters

The temporary aka config fragment (/var/lib/korri/config/retroarch-gba.korri.yaml) hardcodes the current korri-retroarch-source Nix store path as the absolute retroarch command to satisfy source-machine prepare. That store path changes on the next aka rebuild, so the GBA stream entry will silently break. Needs a stable absolute path (e.g. retroarch in environment.systemPackages -> /run/current-system/sw/bin/retroarch) or the upstream absolute-command fix, then remove the store-path hack.

## Acceptance Criteria

- [ ] aka's GBA RetroArch entry references a rebuild-stable absolute command, not a raw /nix/store path
- [ ] The temporary retroarch-gba.korri.yaml store-path override is removed once the durable fix lands
- [ ] GBA stream still launches after an aka rebuild

## Related

- `hosts/aka/default.nix (mountainous)`
- `/var/lib/korri/config/retroarch-gba.korri.yaml (aka runtime)`
