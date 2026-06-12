# @korri/pi-korrid-tools

Distributable Pi package for active-use Korri daemon control through the portable HTTP RPC endpoint.

## Install

Published package:

```sh
pi install npm:@korri/pi-korrid-tools@0.1.0
```

Development from this repository:

```json
{
  "packages": ["../packages/pi-korrid-tools"]
}
```

The package intentionally calls the daemon over HTTP RPC and does not import Korri app internals or repo path aliases at extension load time. Tool input-validation failures resolve as structured `isError: true` tool results instead of rejecting the tool promise.

## Tools

- `korrid_query`: read-only server, library, source, session lifecycle, and stream-control queries. `command: "rpc"` is available only for known read-only tags.
- `korrid_find_game`: finds a playable id/title by querying `app.library.list` and applying the shared exact-id-then-fuzzy semantics locally.
- `korrid_dry_run_launch`: resolves a launch through `app.library.launch.dry-run` without spawning or requiring confirmation.
- `korrid_launch_game`: launches a playable id through `app.library.launch`; requires `confirmLaunch: true`.
- `korrid_stop_session`: stops the active foreground session through `app.session.stop`; requires `confirmStop: true`; supports `force: true`.
- `korri_steam_launch_supervise`: read-only SSH observer for a Steam AppID launch; classifies Steam prompts, instant exits, FEX/runtime failures, live game processes, Freedreno/Turnip usage, render-node access, and input access.
- `korri_steam_runtime_verify`: read-only SSH verifier for Korri-managed Steam/FEX mutable runtime state; checks Sniper FEX trampolines, `.x86_64` backups, runtime-prep unit/watchers, and FEX-rootfs Freedreno architecture.

`host` accepts a host name such as `bandai` and maps to `http://bandai:3001/api/rpc`. `url` may be a base URL or a full `/api/rpc` URL.

Session lifecycle (`app.session.status`) is distinct from stream-control settings (`app.stream-control.state.get`).
