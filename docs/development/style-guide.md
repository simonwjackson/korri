# Style Guide

Source of truth for how code should look and read.

## Formatting

Biome is the formatter and linter.

- Use 2-space indentation.
- Use semicolons only as needed.
- Prefer double quotes.
- Keep formatting Biome-compatible.
- Avoid trailing whitespace.
- Keep files small and purpose-specific.

## Naming

| Thing | Convention | Example |
|---|---|---|
| React component | `PascalCase.tsx` | `WelcomeCard.tsx` |
| Hook | `useFoo.ts` / `useFoo.tsx` | `useWelcomeData.ts` |
| Route | `+` prefix | `+index.tsx` |
| Single RPC | `rpc.ts` / `rpc-handler.ts` | `hello/rpc.ts` |
| Multi RPC | `<action>.rpc.ts` / `<action>.rpc-handler.ts` | `get.rpc.ts` |
| Pure logic test | `*.test.ts` / `*.spec.ts` | `resolver.test.ts` |

## Imports

- Prefer relative imports inside a small local area.
- Use `import type` where appropriate.
- Follow aliases and module-boundary rules in `docs/development/standards.md`.

## TypeScript

- TypeScript strict mode is required.
- Avoid `any`.
- Prefer explicit types at module boundaries.
- Prefer Effect Schema as the source of truth for RPC payloads, responses, and typed errors.
- Choose clear names over clever abstractions.

## React and UI

- Keep one component per file.
- React component files must use `PascalCase.tsx`.
- Hooks must use `useFoo.ts` or `useFoo.tsx`.
- Prefer early returns for complex conditional rendering.
- Keep route files thin and focused on route concerns.
- Build UI with Tailwind.
- Prefer composition over one-off abstractions.

## Comments

- Comment the why, not the obvious what.
- Keep comments current or delete them.
- Use doc comments sparingly and only when they add real value.
