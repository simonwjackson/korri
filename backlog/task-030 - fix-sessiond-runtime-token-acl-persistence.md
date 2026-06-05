---
id: task-030
title: Fix sessiond runtime token ACL persistence
status: In Progress
priority: high
labels:
  - bug
  - nixos
  - sessiond
  - launch
created: 2026-06-05
source: user
---

# Fix sessiond runtime token ACL persistence

## Why it matters

On Bandai, korri-sessiond's generated unit contains the sharedGroup token setup script, but after a normal service restart /run/korri-sessiond and token ended up root:root, causing korri-server managed launches to fail with HostUnavailable/exit 126 until the setup script was run manually. This makes local game launch fragile across restarts and can be mistaken for gamescope/RetroArch failures.

## Acceptance Criteria

- [ ] Sessiond token preparation is a declarative boot/start dependency, preferably a dedicated `korri-sessiond-token.service` oneshot ordered before both `korri-sessiond.service` and `korri-server.service`.
- [ ] Restarting `korri-sessiond.service` leaves `/run/korri-sessiond` as `root:<sharedGroup>` with mode `0710` and `/run/korri-sessiond/token` as `root:<sharedGroup>` with mode `0640`.
- [ ] Restarting `korri-server.service` after a sessiond restart can still read `KORRI_SESSIOND_TOKEN_FILE` and authenticate to sessiond without manually rerunning the token setup script.
- [ ] The unit fails loudly during startup if the configured peer user cannot read the token, rather than letting later UI launches surface as `401 Unauthorized` / `HostUnavailable`.
- [ ] A NixOS check or VM/unit assertion covers the sharedGroup runtime directory, token ownership/mode, server token path, and server→sessiond auth contract.

## Related

- `product/systems/nixos/modules/korri-sessiond.nix`
- `product/systems/nixos/images/kiosk.nix`

## Notes

Observed on bandai: active unit `ExecStartPre` script chowns `root:korri-server` and chmods `0640`, but after restart the token still ended up `root:root` and `korri-server` could not read it. Manual run of `/nix/store/...-korri-sessiond-token-setup` fixed live launch auth.

Updated diagnosis / preferred permanent fix (2026-06-05):

- Keep token generation owned by sessiond, but make ACL preparation an explicit systemd invariant instead of an implicit manual recovery step.
- Preferred design: split token setup into a dedicated `korri-sessiond-token.service` oneshot that:
  - creates `/run/korri-sessiond` as `root:<sharedGroup>` mode `0710`,
  - creates/preserves `/run/korri-sessiond/token`,
  - sets token ownership/mode to `root:<sharedGroup>` `0640`,
  - runs before both `korri-sessiond.service` and `korri-server.service`.
- Add a post-setup/readability assertion such as `su -s /bin/sh korri-server -c 'test -r /run/korri-sessiond/token'` for kiosk hosts, so ACL regressions fail during service startup rather than later as launch/auth failures.
- Relevant current config: `product/systems/nixos/images/kiosk.nix` sets `services.korri.sessiond.sharedGroup = "korri-server"`; `product/systems/nixos/modules/korri-sessiond.nix` currently embeds setup in `ExecStartPre`.
