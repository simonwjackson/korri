{
  "reviewer": "testing",
  "findings": [
    {
      "severity": "P1",
      "confidence": 80,
      "disposition": "proposed",
      "title": "Owner error-path tests omit thrown/rejected adapter failures despite identifying them as the main stranding risk",
      "location": "docs/plans/2026-05-26-006-feat-foreground-session-lifecycle-phase1-plan.md:315-326,389",
      "evidence": "U4 covers typed adapter input/prepare and spawn failures, but the plan separately names thrown adapter errors as the main state-lifecycle risk. No test scenario explicitly makes the adapter throw or reject after the owner has reserved a non-idle state.",
      "impact": "An implementation can pass the planned tests while leaving the owner stuck busy forever on an exception path, which is the highest-risk lifecycle failure called out by the plan.",
      "recommendation": "Add U4/U5 tests where the adapter rejects/throws after acceptance and assert a typed failure, failure evidence, and deterministic release back to idle-ready. Include at least one case after the synchronous reservation point."
    },
    {
      "severity": "P1",
      "confidence": 78,
      "disposition": "proposed",
      "title": "Busy-before-side-effects coverage is narrower than the side effects the bridge promises to skip",
      "location": "docs/plans/2026-05-26-006-feat-foreground-session-lifecycle-phase1-plan.md:350-359,366-377",
      "evidence": "The approach says busy must run before connection lookup, input preflight, Gamescope policy resolution, remote prepare, Sway snapshot, local spawn, and foreground repair. The main AE5 scenario only names connection-dependent prepare and local spawn, with separate precedence checks for missing connection and input failure.",
      "impact": "A bridge could still perform connection lookup, input preflight, Gamescope policy resolution, Sway snapshot, or foreground repair on a busy request and still satisfy the documented scenario wording, violating R4's no-side-effects requirement.",
      "recommendation": "Make the launch-bridge busy test assert that every injected dependency before/inside the accepted path is not called: getConnection, preflight, resolveGamescope policy, prepare, snapshot, spawn, and foreground repair."
    },
    {
      "severity": "P1",
      "confidence": 76,
      "disposition": "proposed",
      "title": "No test proves the fail-closed path when a successful Moonlight start lacks a managed session handle",
      "location": "docs/plans/2026-05-26-006-feat-foreground-session-lifecycle-phase1-plan.md:260-264,350-356,366-377",
      "evidence": "U3 makes the managed handle optional for the Moonlight launcher seam, while U5 requires accepted successful launches without a handle to fail closed as adapter failures. The test scenarios cover handle propagation and Moonlight startup failure, but not a started/no-handle result.",
      "impact": "The owner could return launched without an observable session exit or become stranded in running, defeating R5 while still passing the planned happy-path and startup-failure tests.",
      "recommendation": "Add an owner/bridge test where Moonlight returns status started without a managed handle; assert a typed adapter failure/prepared-no-Moonlight-equivalent outcome as chosen by the contract, lifecycle failure evidence, and release back to idle-ready."
    },
    {
      "severity": "P2",
      "confidence": 70,
      "disposition": "manual",
      "title": "Feature-bearing main.ts diagnostic-runner and shutdown changes lack an explicit testable file path",
      "location": "docs/plans/2026-05-26-006-feat-foreground-session-lifecycle-phase1-plan.md:254-279,342-348,350-357,400-402",
      "evidence": "The plan modifies main.ts to remove replacement behavior, return the active handle, and route shutdown through the owner. The listed tests are launcher, bridge, create-desktop-app, and smoke tests; none is named as a direct test seam for the diagnostic runner/shutdown behavior in main.ts.",
      "impact": "The exact regression called out in the risk table—existing diagnostic runner replacement behavior surviving—may not be caught if it remains embedded in the desktop composition root.",
      "recommendation": "Either extract the diagnostic runner/shutdown wiring into a testable desktop module with a colocated test, or explicitly state which existing test will exercise no-replace and owner-termination behavior through public composition."
    }
  ],
  "residual_risks": [],
  "testing_gaps": [
    {
      "severity": "P2",
      "confidence": 65,
      "disposition": "proposed",
      "title": "Atomic reservation is tested by per-state re-entry but not by two same-tick idle launches",
      "location": "docs/plans/2026-05-26-006-feat-foreground-session-lifecycle-phase1-plan.md:299-308,315-326",
      "recommendation": "Add a deterministic race test that starts two launch calls from idle in the same turn, gates the adapter with a controlled promise, and asserts exactly one adapter invocation plus one busy result."
    },
    {
      "severity": "P3",
      "confidence": 60,
      "disposition": "proposed",
      "title": "U2 schema coverage names the scenario but not a clearly schema-owned test path",
      "location": "docs/plans/2026-05-26-006-feat-foreground-session-lifecycle-phase1-plan.md:219-239",
      "recommendation": "Clarify whether the busy-category schema encode/decode test lives in local-stream-launch-rpc coverage or in launch-bridge RPC integration; avoid relying only on renderer mapping tests for a schema change."
    }
  ]
}
