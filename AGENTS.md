# Working Agreement

## Placement and Ownership

- Runtime app code lives under `korri/products/*`.
- Shared runtime code lives under `korri/shared/*`.
- Deployment/bootstrap entrypoints live under `korri/deploy/*`.
- Repo tooling, generators, test infrastructure, and scripts live under `tools/*`.
- Use product aliases for cross-folder imports inside a product.
- Use `@shared/*` only for genuinely shared runtime code.
- Do not introduce `~/*`, `#/*`, `$/*`, or `@/*`.
- Do not create barrel exports.

## Implementation Patterns

### API

RPC folders are organized by domain concept, not HTTP verb.

Single RPC:

```text
<feature-or-domain>/api/<concept>/
  rpc.ts
  rpc-handler.ts
```

Multi RPC:

```text
<feature-or-domain>/api/<concept>/
  get.rpc.ts
  get.rpc-handler.ts
  save.rpc.ts
  save.rpc-handler.ts
```

Rules:

- Contracts must be defined with Effect Schema in `rpc.ts` / `*.rpc.ts`.
- Handlers live in `rpc-handler.ts` / `*.rpc-handler.ts`.
- RPC tags follow `entity.concept.action`.
- Reuse shared helpers from `@shared/api/rpc/*` where possible.
- Typed API errors come from `@shared/api/rpc/errors` and are discriminated on `_tag`.
- Generated files must not be edited manually.

### Feature gates

- Gate declarations live next to the feature in `gate.ts`.
- Regenerate the registry with `just generate-gates` after adding/removing gates.
- Use `<FeatureGate gate="..." current={...} next={...} />` for UI branching.
- Use `requireGate` or `branchOnGate` for API branching.
- Gates are temporary and should be removed when the feature ships.

### State and forms

- Server state should use the shared Effect RPC client/query infrastructure, typically `useRpcQuery`.
- Local UI behavior should use local React state/hooks.
- Forms should use React Hook Form with Effect Schema validation if forms are introduced.

## Testing

- Prefer pure unit tests for logic and RPC handlers.
- Browser E2E tests use authored `.feature` files plus generated Playwright wrappers.
- Generated E2E wrappers under `e2e/generated/` are read-only and regenerated with `just generate-bdd`.
- Generated files are read-only.

## Verification

Behavioral changes must be verified with a real command or test.

```bash
just dev | just dev-web | just dev-api
just test-unit
just test-e2e
just format
just lint
just typecheck
```

## Rules of Engagement

- Never create documentation, report, or summary Markdown files unless explicitly requested.
- Before changing code, read a nearby similar feature/domain first and follow the local pattern.
- TypeScript typechecking is whole-repo only because of path aliases. Run `just typecheck`.
- Do exactly what was asked. No bonus refactors.
- Read before you touch. Do not propose changes to code you have not read.
- Use `@shared/logger`, not `console.log` in runtime code.
- Do not store sensitive data in `localStorage`.
- When extracting date parts from ISO strings, UTC methods must be used.

## Irreversible Actions

Freely take local, reversible actions. Confirm first for destructive actions, visible shared-state changes, force pushes, or dependency removals with unclear impact.
