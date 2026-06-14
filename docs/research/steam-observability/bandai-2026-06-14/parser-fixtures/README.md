# Steam parser fixtures

Source-specific, sanitized Bandai log slices for Steam observability parser and reducer tests.

- `content-log-*.txt`: AppID state changes from `content_log.txt`.
- `gameprocess-log-*.txt`: tracked PID lifecycle from `gameprocess_log.txt`.
- `console-log-*.txt`: launch task and console process evidence from `console_log.txt`.
- `shader-log-appid-evidence.txt`: shader/cache evidence only; not lifecycle authority.

Paths under the Steam root are represented with `<steam-home>`, Korri binaries with `<korri-bin>`, and Steam userdata ids with `<steam-user-id>`.
