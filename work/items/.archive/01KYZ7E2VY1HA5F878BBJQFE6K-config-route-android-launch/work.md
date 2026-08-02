# Legacy configuration to plugin-backed Android launch

- id: 01KYZ7E2VY1HA5F878BBJQFE6K
- status: completed
- created: 2026-08-01
- completed: 2026-08-02
- terminal reason: Implemented, independently reviewed, host-verified, and proven on an installed Android app route using the Pixel 3 Calculator target.
- plan: plan.md
- branch: feat/config-route-android-launch

## Execution units

- U1: Pin and hydrate proseQL source
- U2: Port the strict legacy-readable contract
- U3: Load and review the fixed atomic snapshot
- U4: Bundle Android plugin policy
- U5: Resolve the checkpoint route
- U6: Replace hardcoded TMNT with the signed route
- U7: Prove the installed Android journey
- prerequisite: Slice 1 landed in 9f2f7957
- origin research: docs/research/proseql-as-korrid-config.md + docs/research/android-app-plugin-schema-checkpoint/README.md
