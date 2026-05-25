{
  "reviewer": "adversarial",
  "findings": [
    {
      "title": "Cascade: dry-run partition guard passes while `just test-unit` exits before running tests",
      "severity": "high",
      "confidence": 100,
      "autofix_class": "manual",
      "owner": "human",
      "description": "The new partitioning guard validates the resolved just recipe text, but not whether Bun accepts or honors that command. In this repo's current Bun (1.3.10), `--path-ignore-patterns` is not a recognized `bun test` option; Bun treats the glob as a positional filter, finds no matching test file, and exits 1. Because `check` depends on `test-unit`, the standard validation cascade stops before the fast suite, nix suite, BDD check, or bun-deps check run.",
      "evidence": [
        "Trigger: run the new default fast-suite command through the public recipe: `just test-unit`.",
        "Execution path: the justfile resolves `test-unit` to `bun test --path-ignore-patterns \"**/tools/testing/nix/**\"`.",
        "Observed outcome: Bun prints `The following filters did not match any test files: **/tools/testing/nix/**` and `Recipe `test-unit` failed ... exit code 1` instead of excluding nix tests.",
        "Guard bypass: `bun test --path-ignore-patterns \"**/tools/testing/nix/**\" tools/testing/standards/test-suite-partitioning.test.ts` passes all four new standards tests because they only assert that the dry-run text contains `--path-ignore-patterns`, the nix glob, and `bun test`.",
        "Cascade: `just check` dry-runs to `... typecheck -> test-unit -> test-nix ...`; at runtime the unsupported flag makes `test-unit` fail first, so `test-nix` is never reached."
      ],
      "suggested_fix": "Replace the unsupported exclusion flag with an exclusion mechanism verified against the installed Bun version, then change the standards guard from substring checks to a harmless behavioral probe (for example, a temporary ignored-path test plus a non-ignored sentinel, or an execution of the resolved recipe in a controlled fixture)."
    },
    {
      "title": "Cascade: one hard-error kiosk scenario can poison every batched kiosk-module test",
      "severity": "medium",
      "confidence": 75,
      "autofix_class": "advisory",
      "owner": "human",
      "description": "The kiosk fixture now serializes all scenarios through one `nix eval --json`. That is fast for assertion-style failures, but a single scenario that fails evaluation itself aborts the whole file before any `it(...)` can identify the affected case. The server fixture has a two-mode escape hatch for hard-failure cases; the kiosk fixture does not, so future negative kiosk scenarios have an easy way to convert a local expected failure into a file-wide module-load failure.",
      "evidence": [
        "Trigger: add a future kiosk scenario under `scenarios = { ... }` that has a Nix type error or explicit throw, e.g. `badType = evaluateWith { services.korri.kiosk.user = []; };` or an override that makes a generated path unreadable.",
        "Execution path: `korri-kiosk-module-eval.test.ts` calls `evalAllScenarios()` inside the `describe` body; that runs exactly one `nix eval --json --file korri-kiosk-module-eval.fixture.nix --apply 'f: f { flakeRoot = ...; }'`.",
        "Evaluation boundary: `korri-kiosk-module-eval.fixture.nix` returns `{ inherit scenarios; }`; JSON serialization must force each scenario value. Assertion failures are converted into `assertionsPassed = false`, but Nix evaluation/type errors are not contained by `evaluateWith`.",
        "Failure outcome: `child.status !== 0` throws `nix eval failed ...` before the test cases run, so all existing kiosk tests fail together and the failure is reported as fixture-load failure rather than the newly added scenario's expected negative case.",
        "Contrast: `korri-server-module-eval.fixture.nix` explicitly keeps hard-crash scenarios out of the batch with `overrides ? null` and a per-call `evalFixture`; the kiosk fixture lacks the same boundary."
      ],
      "suggested_fix": "Give the kiosk fixture the same two-mode shape as the server fixture, and document that scenarios which are expected to make `nix eval` itself fail must use the per-call path rather than the shared `scenarios` attrset."
    }
  ],
  "residual_risks": [
    {
      "title": "`defaultUserMode` is shared by user-service compatibility and CLI-default assertions",
      "description": "A future edit that adjusts `defaultUserMode` for one semantic group also mutates the other group's fixture input. That will likely fail tests rather than silently pass, but it creates avoidable coupling between unrelated reasons for enabling the server. Split it if either group needs scenario-specific setup."
    },
    {
      "title": "Removing `test-nix` while leaving it in `check` fails clearly at dry-run time",
      "description": "The current standards helper calls `just --dry-run test-nix` and `just --dry-run check`, so a missing recipe should fail with Just's missing-recipe error before any suite runs. I did not find a current hidden cascade for this case."
    }
  ],
  "testing_gaps": [
    {
      "title": "Partition guard validates command text, not command behavior",
      "description": "It misses unsupported flags and cannot prove that the nix directory is actually excluded from auto-discovery or from subdirectory invocation paths."
    },
    {
      "title": "Dry-run substring checks are brittle around semantically equivalent justfile shapes",
      "description": "The exact `check` assertion requires `--path-ignore-patterns \"**/tools/testing/nix/**\"` and `bun test tools/testing/nix/`; equivalent recipes using `--flag=value`, unquoted interpolation, variables, or a wrapper command can fail the guard even if they execute correctly."
    }
  ]
}
