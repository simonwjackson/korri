# Korri (main)

This branch is a deliberate restart. Architecture and folder structure are
being decided as each end-to-end slice lands — do not assume conventions from
the `legacy` branch apply here unless this file says so.

## Rules of engagement

- `legacy` is read-only reference material. Harvest code from it deliberately;
  never merge it wholesale.
- Bring in as little as possible per slice. If a slice doesn't need it, it
  doesn't come over.
- The first platform target is Android (Artemis-based streaming client).
- Read before you touch. Do exactly what was asked. No bonus refactors.
