# Development Standards

## Code placement

- Runtime app code lives under `korri/products/*`.
- Shared runtime code lives under `korri/shared/*`.
- Deployment/bootstrap entrypoints live under `korri/deploy/*`.
- Repo tooling, generators, test infrastructure, and scripts live under `tools/*`.

## Imports and boundaries

- Use product aliases for cross-folder imports inside a product.
- Use `@shared/*` only for genuinely shared runtime code.
- Do not introduce `~/*`, `#/*`, `$/*`, or `@/*`.
- Do not create barrel exports.

## API

RPC folders are organized by domain concept, not HTTP verb.

```text
<feature-or-domain>/api/<concept>/
  rpc.ts
  rpc-handler.ts
```

Rules:

- Contracts must be defined with Effect Schema in `rpc.ts` / `*.rpc.ts`.
- Handlers live in `rpc-handler.ts` / `*.rpc-handler.ts`.
- RPC tags follow `entity.concept.action`.
- Reuse shared helpers from `@shared/api/rpc/*` where possible.
- Typed API errors come from `@shared/api/rpc/errors` and are discriminated on `_tag`.

## Feature gates

- Gate declarations live next to the feature in `gate.ts`.
- Regenerate the registry with `just generate-gates`.
- Use `<FeatureGate>` for UI branching.
- Use `requireGate` or `branchOnGate` for API branching.
- Remove gates when the feature ships.

## Verification

Behavioral changes must be verified with a real command or test.

```bash
just dev | just dev-web | just dev-api | just dev-playwright | just dev-storybook
just test-unit
just test-e2e
just format
just lint
just typecheck
```
