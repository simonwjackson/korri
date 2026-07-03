# @korri:moonlight

Korri's first-party Moonlight game-streaming backend, contributed as a plugin.

Moonlight is the same class of dependency as `@korri:gamescope`, `@korri:steam`,
and `@korri:retroarch` — a specific third-party tool the engine drives. It is
exposed through generic streamer dispatch so the engine keeps no direct Moonlight
imports.

## Capabilities

| Operation | Module | What it does |
|---|---|---|
| `stream.launch` | `src/moonlight-launch-spec.ts` | Compose the Moonlight launch spec (command, flags, input devices, env overlays) from policy + launch facts. |
| `stream.discover` | `src/lan-stream-discovery.ts` | mDNS/Bonjour LAN discovery of Korri stream hosts. |
| `stream-control.apply` / `stream-control.describe` | `src/moonlight-control-*.ts` | Live local-control protocol: bitrate/fps/resolution apply + readback over the control socket. |

## Design notes

- Seam shape: dispatch operations are generic, payloads stay Moonlight-shaped
  (`MoonlightLaunchFacts`, `MoonlightPolicy`, bitrate/fps/resolution). A neutral
  streamer abstraction is deferred until a second backend exists.
- Runtime product code must reach Moonlight through the plugin registry, never by
  importing `src/*` directly.

See `product/plugins/AGENTS.md` for the first-party plugin authoring contract.
