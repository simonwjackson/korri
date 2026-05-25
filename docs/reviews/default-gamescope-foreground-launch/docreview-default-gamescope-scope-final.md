# Scope review: default Gamescope foreground launch plan (final)

No P0/P1 scope blockers remain.

The prior blockers are addressed:
- Remote cancellation/quarantine is no longer active scope; the plan now defers active cancellation and relies on visible partial-failure diagnostics plus existing intent expiry.
- Local foreground-client policy is narrowed to a policy-only resolver over local host/global, named client/launcher policy, and local override; it explicitly avoids a new host layer, synthetic library game, or remote game-policy inheritance for local Moonlight.
