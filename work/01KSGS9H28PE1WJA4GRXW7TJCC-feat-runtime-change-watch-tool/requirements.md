---
date: 2026-05-26
topic: korri-runtime-change-watch-tool
---

# Korri Runtime Change Watch Tool Requirements

## Summary

Korri should provide a tiny attach-only operator tool for a running Moonlight session: send one explicit runtime quality change, watch the session/device response, and save structured evidence. The v1 tool stays small, but its scenario/result shape should be able to grow into automated E2E testing later.

---

## Problem Frame

Korri's runtime streaming work is moving from one-off validation scripts toward hardened Moonlight/Sunshine mechanisms. Today, proving a live bitrate, FPS, or resolution change still depends on hand-built commands, log greps, temporary scripts, and human interpretation.

That makes iteration slow for an operator or agent trying to answer a simple question: "If I make this runtime change right now, what happened on the running stream?" It also risks producing evidence that is useful once but hard to repeat, compare, or promote into future automated coverage.

---

## Actors

- A1. Operator/agent: Runs a focused diagnostic scenario against an already-running stream and reads the result.
- A2. Korri stream/runtime layer: Knows how to attach to the active Moonlight control surface and present a stable diagnostic workflow.
- A3. Moonlight session: Receives runtime commands and emits control/session outcomes.
- A4. Device or stream target: Provides the observed session behavior that the operator is trying to verify.

---

## Key Flows

- F1. One-change watch run
  - **Trigger:** An operator/agent wants to test one runtime quality change on an already-running Moonlight stream.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The operator points the tool at the active session, chooses one runtime action, the tool sends it through the Moonlight control surface, follows relevant session/device feedback for a bounded period, then writes a structured result.
  - **Outcome:** The operator can see whether the command was accepted, whether a correlated outcome was observed, and where the evidence was saved.
  - **Covered by:** R1, R2, R3, R4, R6

- F2. Future-testable scenario run
  - **Trigger:** The same diagnostic scenario needs to be repeated by an agent or later test harness.
  - **Actors:** A1, A2
  - **Steps:** The scenario is invoked non-interactively, produces a deterministic result shape, exits with a clear pass/fail/inconclusive outcome, and stores enough context to debug failures.
  - **Outcome:** The run is useful both for today's manual/device watching and tomorrow's automated E2E evolution.
  - **Covered by:** R5, R7, R8, R9

---

## Requirements

**Scope and invocation**
- R1. The v1 tool must be attach-only: it assumes a Moonlight stream already exists and must not own pairing, app launch, Moonlight launch, reconnect, teardown, or host selection.
- R2. The tool must support one focused runtime scenario per invocation rather than becoming an interactive console or dashboard.
- R3. The operator/agent must be able to request a narrow runtime action such as probing capabilities or setting a single quality dimension, subject to whatever the active session reports as supported.

**Observation and evidence**
- R4. The tool must watch for a bounded amount of time after sending a runtime action and report the observed control/session outcome instead of only reporting that the command was sent.
- R5. Every run must write a structured artifact that includes the requested action, session attachment context, observed outcomes, timing, and enough diagnostic detail for another agent or human to inspect later.
- R6. The result must distinguish at least: local attach failure, local command rejection, command sent with no terminal outcome, host/device rejection, applied/successful outcome, and inconclusive observation.

**Future E2E path**
- R7. The scenario/result model must be stable enough for non-interactive use by future automated tests, even if v1 is primarily a human/agent diagnostic tool.
- R8. Stronger proof modes such as packet/frame analysis or real device render/decode validation may be added later as profiles; v1 must not require them to be useful.
- R9. The tool must avoid overclaiming support: especially for runtime resolution, a control-plane success alone must not be presented as full device support without appropriate device-side evidence.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R4, R5.** Given a Moonlight stream is already running with a control surface available, when an operator runs one bitrate-change watch scenario, the tool attaches, sends one command, observes a correlated outcome or timeout, writes an artifact, and exits.
- AE2. **Covers R1, R6.** Given no active Moonlight control surface is available, when the operator runs the tool, it fails as an attach problem and does not attempt to launch Moonlight or start a stream.
- AE3. **Covers R6, R9.** Given a runtime resolution command receives only a control-plane applied outcome, when the tool reports the result, it marks the control result separately from device/render proof and does not call the scenario fully device-supported.
- AE4. **Covers R7, R8.** Given the same scenario is run later by automation, when the tool completes, automation can read a clear terminal result and artifact path without scraping human-oriented prose.

---

## Success Criteria

- An operator or agent can make one runtime change and quickly understand what happened without reconstructing commands, logs, and temporary evidence by hand.
- The output is useful for immediate manual/device watching and durable enough for later review.
- Planning can implement the first slice without designing adaptation policy, product UI, or a full test framework.
- The result shape creates a credible migration path toward automated E2E scenarios without requiring that automation in v1.

---

## Scope Boundaries

- No Moonlight launch, Sunshine launch, app selection, pairing, reconnect, teardown, or session orchestration in v1.
- No autonomous adaptation policy.
- No product UI controls or telemetry dashboard.
- No LAN, remote API, or browser-facing control bridge.
- No full E2E test framework in v1.
- No requirement that v1 prove packet/frame or render/decode behavior for every command.
- No production support claim for runtime resolution without real client-side render/decode evidence.

---

## Key Decisions

- Attach-only first: this keeps the tool small and lets it sit on top of the Moonlight control mechanisms currently being hardened.
- One scenario per run: a bounded run is easier for agents, humans, and future automation to reason about than an open-ended console.
- Structured artifact over polished UI: the first value is repeatable evidence, not a user-facing control panel.
- Staged proof model: control-plane observation is useful now, while stronger device/media proof can be added later as separate profiles.

---

## Dependencies / Assumptions

- The active Moonlight session exposes or will expose a local control/observability surface from the Moonlight-side work.
- The runtime settings hardening work provides sufficiently structured command outcomes for bitrate/FPS and conservative handling for resolution.
- The operator/agent can identify or discover the active session attachment point through Korri's runtime/session context.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Which first runtime actions should v1 expose: capability probe only, bitrate, FPS, resolution, or a small fixed subset?
- [Affects R4, R5][Technical] What is the minimum observation window and artifact content that make a run useful without turning v1 into a full harness?
- [Affects R6][Technical] How should inconclusive outcomes map to process exit codes for future automation?
