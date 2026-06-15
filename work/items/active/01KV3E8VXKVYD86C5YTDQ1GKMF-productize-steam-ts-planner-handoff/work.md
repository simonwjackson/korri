# Productize Steam TS planner handoff

## Intent

Move the Bandai-validated mutable Steam TS/Bun planner prototype into source-controlled TypeScript and Nix packaging while preserving the final Bash `exec` handoff.

## Scope

- Source-controlled typed planner for Steam AppID Gamescope/MangoHud launches.
- NUL-delimited planner output consumed by a small Bash wrapper.
- Nix-managed wrapper reachable at the existing `/var/lib/korri/bin/korri-steam-gamescope-launch` LaunchOptions target.
- Tests and Bandai validation for no-Bun-parent process semantics.

## Out of scope

- Broader foreground lifecycle supervisor normalization.
- Steam/emulator/stream launch ownership unification.
- Rewriting the VDF materializer unless explicitly pulled into this item later.

## Plan

See `plan.md`.
