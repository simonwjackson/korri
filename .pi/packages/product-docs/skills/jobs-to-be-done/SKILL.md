---
name: jobs-to-be-done
description: Jobs to be Done (JTBD) authoring conventions for this repo. Use when creating, editing, reviewing, or referencing job docs under docs/jobs/, when wiring a feature brief's `jobs:` frontmatter, or when answering questions like "what jobs exist?", "what job does this feature serve?", or "how do I write a JTBD here?".
---

# Jobs to be Done

A **job** captures durable user intent — *why* a user cares — and is meant to outlive any specific implementation. Features come and go; the job stays stable.

## Where Jobs Live

```text
docs/jobs/<job-id>.md
```

- One file per job. The filename (minus `.md`) is the job's `id`.
- Jobs are runtime-agnostic. They never reference specific UI, API, or product code.
- A job is owned by the product, not by a feature. Multiple features may reference the same job.

## Required Frontmatter

```yaml
---
id: safe-game-resume
title: Safe Game Resume
status: draft
---
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | kebab-case; must match the filename |
| `title` | yes | Human-readable; can match the H1 |
| `status` | yes | One of: `draft`, `planned`, `active`, `implemented`, `deprecated` |

The frontmatter parser accepts `key: value` pairs and indented `- item` lists. Quotes around values are optional and are stripped.

## Status Lifecycle

| Status | Meaning |
|---|---|
| `draft` | Captured but not validated; evidence may be thin |
| `planned` | Validated enough to commit to building features against |
| `active` | At least one feature is in flight serving this job |
| `implemented` | A shipped feature satisfies the threshold outcomes |
| `deprecated` | Job no longer pursued; kept for history |

A job may stay `active` or `implemented` for a long time. Do not delete jobs — deprecate them.

## Document Shape

Job docs follow a consistent narrative structure. The canonical sections are:

1. **Job Statement** — A single "When… I want… so I can…" sentence.
2. **Triggering Situation** — When and why the job becomes urgent.
3. **Functional Outcome** — Numbered, ID'd outcomes (e.g. `SGR-O1`), each marked **threshold** or **optimizing**.
4. **Emotional and Social Dimensions** — What the user feels; private vs. shared stakes.
5. **Current Solutions Being Fired** — What the user does today instead.
6. **Obstacles** — What gets in the way, plus product stance on each.
7. **Personas Who Perform This Job** — Primary persona and variants.
8. **Job Map** — Define → Locate → Prepare → Execute → Monitor → Modify → Conclude.
9. **Design Implications** — Per-obstacle / per-outcome guidance for builders.

Use `docs/jobs/safe-game-resume.md` as the reference shape.

### Outcome IDs

Outcomes use a short prefix derived from the job, e.g. `SGR-O1` for *Safe Game Resume*. These IDs are how BDD scenarios and feature briefs trace acceptance back to the job. Keep the prefix stable for the life of the job.

### Evidence Notes

If the job is grounded in an interview rather than observed usage, add an explicit **Evidence note** block near the top so readers know which claims are inferred. Do not retrofit confidence later; record it now.

## Wiring Jobs Into Features

Feature briefs link to jobs via frontmatter:

```yaml
---
id: resume
title: Safe Game Resume
status: planned
jobs:
  - safe-game-resume
---
```

Rules:

- Every feature brief must reference at least one job.
- A feature may serve multiple jobs; list each `id` in the `jobs:` array.
- The feature's BDD scenarios should trace either to a brief acceptance ID or to a job outcome ID (e.g. `SGR-O1`).
- After adding a brief, regenerate the feature map: `just generate-feature-map`.

## Listing Jobs

```bash
just list-jobs           # human-readable table
just list-jobs --json    # machine-readable
```

Backed by `tools/scripts/list-jobs.ts`. Reads frontmatter from `docs/jobs/*.md`.

## Authoring Rules

- **One job per file.** If a doc starts describing two jobs, split it.
- **Stay implementation-free.** Mention behavior the user wants, not React routes or RPC handlers. If a section can't be written without naming a component, it belongs in a feature brief.
- **Threshold vs. optimizing matters.** Threshold outcomes are pass/fail; optimizing outcomes are tunable. Tag every outcome.
- **Don't invent personas.** Use the primary persona plus documented variants. New persona types belong in a separate persona doc, not inline.
- **Out-of-scope is part of scope.** End with related jobs that are intentionally *not* covered, so future readers don't try to fold them in.
- **Don't reword the job to match what was built.** If the implementation diverged, update the feature brief or open a new job — don't retroactively reshape the job statement.

## When To Create vs. Update vs. Skip

| Situation | Action |
|---|---|
| New durable user intent surfaces during work | Create a job doc |
| Existing job's outcomes need clarification or new evidence | Update the existing job |
| Implementation detail or one-off requirement | Do **not** create a job — it belongs in a feature brief |
| Job is no longer pursued | Set `status: deprecated`; keep the file |

Per repo policy: *"Only create or update a job doc when the work reveals a new durable user job."* Don't spin up jobs speculatively.

## Cross-References

- Feature briefs: `korri/products/<product>/features/<feature>/brief.md`
- BDD coverage: `korri/products/<product>/features/<feature>/e2e/*.feature`
- Generated traceability index: `out/generated/feature-map/feature-map.json` (run `just generate-feature-map`, validate with `just check-feature-map`)
- Working agreement: see "Product Documentation Shape" in the root `AGENTS.md`.
