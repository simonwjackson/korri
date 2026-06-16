# Productize Steam TS planner handoff

## Status

**Parked / superseded on 2026-06-15.** Live Bandai validation showed the per-game Steam LaunchOptions Gamescope wrapper breaks Stray/Steam Input, while Steam-inside-Gamescope preserves controls. Do not productize this wrapper as the default launch path. See `docs/handoffs/steam-launchoptions-wrapper-parked-2026-06-15.md`.

## Intent

Move the Bandai-validated mutable Steam TS/Bun planner prototype into source-controlled TypeScript and Nix packaging while preserving the final Bash `exec` handoff.

## Scope

- Preserve the source-controlled planner/wrapper discoveries for future opt-in research.
- Keep default Steam AppID launches from materializing the per-game Gamescope wrapper.
- Use Steam-inside-Gamescope as the active product direction for Stray/controller-sensitive Steam games.
- If the parked wrapper is revisited, require explicit experimental opt-in and preservation of native LaunchOptions/EULA state.

## Out of scope

- Broader foreground lifecycle supervisor normalization.
- Steam/emulator/stream launch ownership unification.
- Rewriting the VDF materializer unless explicitly pulled into this item later.

## Plan

See `plan.md`.
