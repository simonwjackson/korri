{
  "reviewer": "maintainability",
  "findings": [
    {
      "file": "tools/testing/nix/korri-kiosk-module-eval.fixture.nix",
      "line": 343,
      "severity": "P3",
      "autofix_class": "mechanical",
      "confidence": 85,
      "summary": "`cliEnabledByDefault` duplicates the exact kiosk-enabled scenario already covered by `kioskEnablesClient`.",
      "details": "The overrides at `cliEnabledByDefault` are identical to `kioskEnablesClient` (lines 104-114). Keeping both scenario keys means future changes to the baseline enabled-kiosk fixture must be made in two places, and it also contradicts the server fixture's clearer pattern of reusing one key when multiple tests need the same overrides. Prefer deleting `cliEnabledByDefault` from the fixture/type and having the CLI-default tests read `scenarios.kioskEnablesClient`, or bind the shared evaluated scenario once and expose only one public key."
    },
    {
      "file": "justfile",
      "line": 80,
      "severity": "P3",
      "autofix_class": "docs-only",
      "confidence": 80,
      "summary": "The `test-nix` recipe comment overstates the suite shape by saying each file spawns `nix eval`.",
      "details": "`tools/testing/nix/korri-live-usb-smoke.test.ts` runs `nix build --dry-run` plus a docs smoke, not `nix eval`. Since this comment is now the user-facing explanation for why the suite is split, make it describe the directory as slow Nix-backed tests rather than specifically `nix eval` per file."
    }
  ],
  "residual_risks": [
    "Scenario key naturalness is mostly acceptable. The only naming friction I would not promote to a finding is in `korri-server-module-eval.fixture.nix`: `relativePath` and `mismatchedParent` are generic without the surrounding describe block, so names like `relativeStreamRuntimeDir` and `streamStatusPathOutsideRuntimeDir` would be easier to scan if this file grows.",
    "Do not extract the duplicated `evaluateWith` helper yet. The two fixtures share the evalConfig skeleton, but their module stacks, base modules, and projected result shapes differ enough that a shared helper would likely be a shallow Nix abstraction with more parameters than behavior.",
    "The `runNixEval` / `evalAllScenarios` / `evalFixture` trio in `korri-server-module-eval.test.ts` is justified by the two evaluation modes. If touched again, `evalFixture` could be renamed to `evalUnbatchedScenario` to avoid colliding with the other files' whole-fixture `evalFixture()` convention.",
    "The U4-U7 comment blocks are generally the right length for explaining why a file is or is not batched. Their plan-step references (`U4`, `U5`, etc.) are useful during this refactor but may become stale once the plan is no longer the entry point."
  ],
  "testing_gaps": []
}
