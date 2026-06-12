# korrid-tools Pi package

Reusable Pi tools for active-use Korri daemon control through the portable HTTP RPC endpoint.

## Tools

- `korrid_query`: read-only server, library, source, session lifecycle, and stream-control queries. `command: "rpc"` is available only for known read-only tags.
- `korrid_launch_game`: launches a playable id through `app.library.launch`; requires `confirmLaunch: true`.
- `korrid_stop_session`: stops the active foreground session through `app.session.stop`; requires `confirmStop: true`; supports `force: true`.

`host` accepts a host name such as `bandai` and maps to `http://bandai:3001/api/rpc`. `url` may be a base URL or a full `/api/rpc` URL.

Session lifecycle (`app.session.status`) is distinct from stream-control settings (`app.stream-control.state.get`).
