# Gamescope Runtime Control Contract

Date: 2026-06-02
Status: active

## Pattern

Expose Gamescope runtime controls through a typed, local, owner-only Unix-socket protocol. Treat X11 atoms, private Wayland protocols, and native `gamescope-korri` hooks as interchangeable backend mechanisms behind that public contract.

## Why

Gamescope exposes useful live controls, but the raw mechanisms are not product-safe:

- X root atoms can be written without acknowledgement.
- Some readbacks are missing or ambiguous.
- Multiple clients can race writes to shared compositor state.
- Stock Gamescope does not promise Korri's result/event semantics.

A bridge-level contract lets Korri coordinate compositor controls with Moonlight/Sunshine runtime quality without tying product code to fragile backend details.

## Rules

1. `gamescope-korri` is the guaranteed target. Stock Gamescope is best-effort and must be capability-gated.
2. The socket is local-only and owner-only by default.
3. Product code calls individual controls; no high-level quality-profile method is part of v1.
4. Valid-but-unimplemented controls return `unsupported`; truly unknown method names return JSON-RPC method errors.
5. A command reports `applied` only after required readback matches.
6. Readback mismatch, readback failure, timeout, backend absence, and session abort are explicit non-success states.
7. Mutations serialize through one bridge-wide FIFO queue.
8. Events are first-class server pushes using the `gamescope.event` envelope with monotonic sequence numbers.
9. Required `state.get` fields fail the whole call when unreadable; optional fields are capability-gated.
10. Physical Bandai captures prove visual/product claims; unit and mocked tests prove protocol coverage.

## Implementation guidance

- Keep the protocol types, validators, and public client in `korri/shared/gamescope-control`.
- Keep backend-specific command execution in backend modules.
- Configure backend selection when starting the bridge process: `gamescope-korri` product sessions should select the native/guaranteed backend once patches exist; X11 remains a debug/stock fallback for proven controls.
- Patch `gamescope-korri` when backend readback or event truth cannot be derived reliably from existing controls.
- Sessiond remains the lifecycle truth. The bridge reports control-plane readiness and state; it does not decide foreground session ownership.

## Verification

Use `docs/acceptance/gamescope-control-api-coverage-contract.md` as the matrix for method/event/error coverage and backlog closure.
