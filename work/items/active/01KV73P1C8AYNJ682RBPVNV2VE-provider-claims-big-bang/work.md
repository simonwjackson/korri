# Provider claims big-bang conversion

## Status

Implemented; targeted verification is green. Full `just test-unit` remains red on pre-existing/unrelated boundary and sessiond/desktop tests outside this provider-claims slice.

## Intent

Convert Korri's readable library and acquisition model away from overloaded source/sourceName vocabulary and into explicit plugin-owned providers, durable provider-links, and ephemeral claim-shaped acquisition outputs.

## Scope

- Replace durable `sources` with explicit plugin-owned `providers`.
- Add top-level durable `provider-links` joining provider ids to playable/release ids with tiny provider-side refs.
- Keep `library` as final authored state.
- Convert Bazzar/acquisition to provider vocabulary and claim-shaped outputs across the board.
- Treat claims as ephemeral cache/state that can be wiped or refreshed without changing library state.
- Full no-backwards-compat big-bang; no legacy aliases or compatibility shims.

## Out of scope

- Field-level provenance.
- Provider priority rules.
- Automatic claim-to-library import; manual authoring only for now.
- Production plugin authoring UX beyond provider id/capability seams required by this conversion.
- Polished UI for comparing provider claims.

## Plan

See `plan.md`.
