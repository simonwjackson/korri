# TODO

## Codify JTBD as an executable testing system

Make jobs/outcomes measurably accomplishable and track regressions over time.
We already have ~80% of Living Documentation: job docs with outcome IDs,
`.feature` files tagged with `@jtbd-*` and `@<outcome-id>`, and a static
`feature-map.json` joining jobs ↔ briefs ↔ BDD ↔ scenarios.

### Gap

The feature map is a link graph; it doesn't know which scenarios pass, and
there's no history.

### Minimal plan (no new deps)

1. **Outcome registry in job frontmatter** — declare the universe of
   outcome IDs (`SGR-O1`…) with `kind: threshold | optimizing` so the
   generator knows what "complete coverage" means.
2. **Ingest test results in `generate-feature-map`** — parse latest
   Playwright/Cucumber JSON, stamp each scenario `passing | failing |
   skipped | fixme`, aggregate up:
   - outcome covered ⇔ ≥1 active passing scenario carries its tag
   - job accomplishable ⇔ all `threshold` outcomes covered
3. **History log** — append per-CI-run rows to
   `out/generated/feature-map/job-health.ndjson`
   (`commit, timestamp, jobId, outcomeId, status`) so we can answer
   "which jobs regressed this week?"

### Then

- Surface coverage + regressions in the Feature Map Explorer UI.
- Consider **Allure** for trend dashboards (consumes existing Cucumber JSON).
- Longer term: pair BDD *capability* claims with production telemetry
  (SLOs / funnels keyed on the same outcome IDs) for real *outcome* claims.

### Reference patterns

Specification by Example (Adzic), Living Documentation (Martraire),
Outcome-Driven Innovation (Ulwick), Goal Question Metric (Basili).
Closest off-the-shelf: Serenity BDD, SpecFlow LivingDoc, Allure.

### Caveat

A green BDD scenario proves the system exhibits the behavior on the example
written down — not that the user felt the outcome. Don't treat "all jobs
green" as ground truth without prod telemetry.
