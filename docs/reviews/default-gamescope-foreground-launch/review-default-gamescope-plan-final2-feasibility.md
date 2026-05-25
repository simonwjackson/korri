## Findings

### P1 — Local Moonlight policy is assigned to a “local host global/client/launcher” cascade that does not currently exist for non-game foreground surfaces

The revised two-host model correctly separates remote game-runner policy from local Moonlight policy, but the plan does not define an implementable resolution path for the local Moonlight side. U5 says to “Resolve local Moonlight Gamescope policy from the local host's global/client/launcher policy,” while the existing resolver requires a concrete game id and immediately looks up `snap.games.get(inputs.gameId)` before it can fold `global → user → system → launcher → game → preset → override`. There is no current “client” cascade layer, and launcher-layer policy is only reachable after resolving a game/launcher context.

Evidence:
- Plan: `Two-host stream launch: the remote source host resolves policy for the remote game runner; the local kiosk/client host resolves policy for the local Moonlight foreground client.`
- Plan U5: `Resolve local Moonlight Gamescope policy from the local host's global/client/launcher policy; do not use the remote source host's game-runner policy as the local host default.`
- Code: `ResolveInputs` in `korri/shared/library/config/cascade-resolver.ts` requires `gameId`, and `resolveLaunchContext` starts by loading `const game = snap.games.get(inputs.gameId)` and failing with `GameNotFound` when absent.
- Code: the folded layers are `global`, `user`, `system`, `launcher`, `game`, selected `preset`, and `override`; there is no local foreground-client layer.

Impact: an implementer cannot satisfy the two-host policy requirement without inventing a new non-game policy resolver, synthetic Moonlight game/launcher record, or separate local client policy source. That decision changes config semantics and should be in the plan before implementation starts.

Recommendation: add an implementation unit/decision that defines local foreground-client policy resolution explicitly — for example, a policy-only resolver for `global → launcher("moonlight") → override`, or a synthetic local `moonlight` launch context — and add tests proving local global opt-out disables local Moonlight while remote game/preset opt-out only affects the remote runner.

Confidence: 100
