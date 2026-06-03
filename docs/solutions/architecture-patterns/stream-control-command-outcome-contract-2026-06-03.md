# Stream-Control Command Outcome Contract

Date: 2026-06-03
Status: active

## Context

Runtime stream-control commands cross multiple backends with different acknowledgement semantics. Moonlight local-control commands can return `command.accepted`, which means the request was accepted but does not prove the visible stream changed. GameScope commands are readback-backed and can report applied, pending, unsupported, failed, readback-failed, or readback-mismatch states.

API consumers need a stable product-level lifecycle contract without parsing backend-specific raw JSON-RPC payloads.

## Contract

Stream-control mutation RPC responses expose:

- `action`: product action name.
- `requested`: request payload.
- `outcome`: stable product command outcome.
- `response`: raw backend/diagnostic response retained for debugging.
- `diagnosticError`: optional event-recording error that must not change command outcome.

Single-target outcomes use:

```ts
{ kind: "single", status: "applied" | "pending" | "failed", error?: string }
```

Linked outcomes use:

```ts
{
  kind: "linked"
  status: "applied" | "pending" | "partial" | "failed"
  moonlight: { status: "applied" | "pending" } | { status: "failed"; error: string }
  gamescope: { status: "applied" | "pending" } | { status: "failed"; error: string }
}
```

## Rules

- Do not treat backend ACK as applied state.
- Preserve pending when the backend accepted the command but authoritative readback has not proved the new value.
- Preserve linked partial failure instead of collapsing it to success.
- Keep raw protocol payloads diagnostic-only; product consumers should prefer `outcome`.
- Displayed UI values must still come from `state.get` readback, not command outcome.
