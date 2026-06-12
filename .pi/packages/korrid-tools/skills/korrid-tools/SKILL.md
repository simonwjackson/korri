---
name: korrid-tools
description: Korri daemon control tools. Use when inspecting or operating a running Korri daemon via HTTP RPC: server status, library listing, source status, session lifecycle, and stream-control settings.
---

# Korrid tools

Use the package tools to inspect and operate a Korri daemon through `/api/rpc`.

- Prefer `korrid_query` for read-only checks: `status`, `library`, `sources`, `source-status`, `session-status`, `stream-state`, and `stream-config`. Use `command: "rpc"` only for known read-only tags; use a dedicated tool for mutating operations.
- Use `korrid_launch_game` only when the user explicitly asks to launch a game, and set `confirmLaunch: true`.
- Use `korrid_stop_session` only when the user explicitly asks to stop the active session, and set `confirmStop: true`. Use `force: true` only for stuck sessions when requested.

Session lifecycle is exposed by `app.session.status` / `app.session.stop`. Stream-control state is runtime settings and is not the current game/session lifecycle.
