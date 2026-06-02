# Korri Plugin Architecture

Date: 2026-06-02
Status: active

## Pattern

Korri plugins contribute typed content, metadata, actions, and secondary surfaces through Effect services and schemas. They do not inject into the gaming home screen, own presentation, or bypass the host's input/navigation contract.

## Decisions

1. **Gaming home relationship:** Shift keeps a games-first home. Multi-source content lives behind a separate library/switcher or plugin route surface; plugins never contribute directly to `/`.
2. **Intent extensibility:** Intents start closed. The host routes only known intent tags; unknown/plugin-private intents fail at the seam until a host-level registry is deliberately added.
3. **User plugin distribution:** User-installed plugins live outside the Nix closure under `~/.config/korri/plugins/<id>`. In-tree plugins may have Nix modules/packages; user plugins must not require rebuilding the system.
4. **RPC namespace:** Plugin RPCs use `plugin.<id>.<action>`. Handler files live under the owning plugin directory and may be exposed only through host composition.
5. **Input contract enforcement:** Every plugin manifest declares `inputContract: "gamepad-first"`; plugin surfaces must also pass the same Storybook/Playwright spatial-navigation checks as first-party UI before they become user-visible.

## Rules

- Use the Playnite-shaped taxonomy: `ContentSource`, `MetadataProvider`, and `GenericPlugin`.
- Keep the theme in control of rendering. Plugins contribute data and actions, not DOM, styling, or home-grid slots.
- Activate plugins lazily from manifest-declared contribution points; no plugin gets an unconditional startup hook by default.
- Capability grants are explicit and separate from trust tier.
- Adopt `@plugins/*` as the plugin-layer alias when the first plugin directory lands; it maps to `korri/plugins/*` and stays separate from both `@app/*` and `@shared/*`.
- First-party plugin code lives under `korri/plugins/<id>/*`; reusable host contracts stay in shared code.

## First implementation slice

Introduce `ContentItem`, `ContentSourceService`, and `ContentSources` alongside the existing `LibrarySource` service, with games represented as tagged `GameItem` content. Existing `LibrarySource` call sites continue to return `ResolvedGameRecord[]` until later slices migrate live layers behind the generalized contract.
