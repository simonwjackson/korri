# Korri platform

Public platform APIs for product apps and themes.

- `protocol/`: framework-neutral schemas, wire contracts, typed errors.
- `browser/`: framework-neutral browser/runtime helpers.
- `input/`: semantic input events and device-to-action adapters.
- `ui/`: framework-neutral tokens/assets/primitives.
- `react/`: optional React adapter hooks, atoms, roots, and components.

Framework-neutral layers must not import React or product app/theme/service internals. React-specific helpers belong under `react/`.
