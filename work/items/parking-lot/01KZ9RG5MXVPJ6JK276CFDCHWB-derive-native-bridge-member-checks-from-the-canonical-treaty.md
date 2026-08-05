---
id: 01KZ9RG5MXVPJ6JK276CFDCHWB
slug: derive-native-bridge-member-checks-from-the-canonical-treaty
title: Derive native bridge member checks from the canonical treaty
origin: parked
status: To Do
priority: medium
labels:
  - testing
  - android
  - bridge-contract
created: 2026-08-05
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: feat/high-risk-test-backfill
  commit: 9c1cc08d
  repo: korri
  invoked_by: se-work
---

# Derive native bridge member checks from the canonical treaty

## Why it matters

The emulator now verifies a deliberate Java allow-list of required bridge methods, but that list can drift when `KorriNativeBridgeSurface` gains a method. A contract-derived manifest would make future additions fail automatically without relying on reviewers to update both lists.

## Acceptance Criteria

- [ ] A canonical build/test projection derives the required bridge method names from `contracts/bridge/korri-native-bridge.ts`.
- [ ] `KorriNativeBridgeContractTest` consumes the projection rather than maintaining its own method-name list.
- [ ] Adding a treaty method without exposing it from Android fails an automated check.

## Related

- `contracts/bridge/korri-native-bridge.ts`
- `clients/android/app/src/androidTest/java/com/limelight/KorriNativeBridgeContractTest.java`
- `clients/android/test/bridge-contract-version.ts`
