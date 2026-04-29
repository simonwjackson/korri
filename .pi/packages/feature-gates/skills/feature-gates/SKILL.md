---
name: feature-gates
description: Feature gate conventions for release flags. Use when creating, editing, or reviewing feature gates, gated UI routes, or gated API handlers. Covers FeatureGate component, branchOnGate, requireGate, gate co-location, and the gate lifecycle.
---

# Feature Gates

Feature gates are temporary scaffolding that protects new code until it is ready.

**Lifecycle:** gate on → develop behind gate → remove gate + old code → new code becomes the code.

## Vocabulary

| Term | Meaning |
|---|---|
| `current` | The old code path; deleted when shipping |
| `next` | The new code path; already in its final position |
| `gate` | The registry key that controls the branch |

## Co-located Gate Declarations

Gate declarations live next to the feature they protect.

```text
korri/products/app/features/example/
  gate.ts
  ui/...
  api/...
```

A `gate.ts` file exports one gate name:

```ts
export const gate = "example.v2" as const
```

The registry at `korri/shared/gates/registry.ts` is generated. Regenerate with:

```bash
just generate-gates
```

## UI Pattern

Use `<FeatureGate>` for release flag branching in JSX.

```tsx
import { FeatureGate } from "@shared/gates/FeatureGate"

<FeatureGate
  gate="example.v2"
  current={<CurrentExperience />}
  next={<NextExperience />}
/>
```

Rules:

- Use `<FeatureGate>` for release flag branching.
- The `next` content should be written as if the gate does not exist.
- Gate checks belong in composition roots, not deep leaf components.
- `useFeatureGate` is for `<FeatureGate>` internals and the gates panel.

## API Pattern

Use `branchOnGate` when replacing existing behavior.

```ts
export const handler = branchOnGate("example.v2", {
  current: currentLogic,
  next: nextLogic,
})
```

Use `requireGate` for gate-exclusive endpoints.

```ts
export const handler = Effect.gen(function* () {
  yield* requireGate("example.v2")
  return yield* nextLogic
})
```

## Removing a Gate

1. Replace `<FeatureGate>` with the `next` content.
2. Replace `branchOnGate(...)` with the `next` Effect.
3. Remove `requireGate(...)` from gate-exclusive endpoints that are now public.
4. Delete the `gate.ts` file.
5. Run `just generate-gates`.

## Rules

- Gates are temporary.
- Gates must never replace normal access control if access control is introduced later.
- Unknown gate names log a warning and resolve OFF.
- Production ignores client-sent gate requests and resolves gates OFF.
