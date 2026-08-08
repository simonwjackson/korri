# Linux device rollout gate

`device-check.sh` is the repository-side gate for a reversible NixOS rollout on one explicit device. It does not contain a default host. It does not discover devices.

The gate is read-only unless `--mode` selects a mutation state. Every invocation requires the candidate generation, expected machine ID, and expected hostname. Before identity inspection, it requires the exact candidate helper at `CANDIDATE/sw/bin/korri-device-gate` to be root-owned, executable, non-writable store content whose SHA-256 matches the local gate source.

## Safety contract

- Default `inspect` mode only reads state. It captures the result in a mode `0700` temporary directory, prints the sanitized result, and removes the temporary directory on exit.
- Before the first SSH call, every mode requires strict canonical Nix generation path syntax for the candidate. Mutation and reconcile modes also require it for rollback. Remote preflight proves that both exact paths exist and contain `switch-to-configuration`.
- The inputd package installs the byte-identical gate as `bin/korri-device-gate`. The NixOS module places it in the candidate system closure. The rollout never uploads or runs a writable script with `sudo`.
- Every SSH command uses a shell-escaped argv plus a local transport deadline and an appropriate remote command deadline. Candidate, rollback, user, and helper paths never enter unquoted remote shell text.
- A mutation also requires a mode `0700` ledger outside the repository, an explicit gameplay user, and a confirmation token bound to the captured machine ID, hostname, and exact candidate generation.
- The script prints the required confirmation token when it is absent. Run the same command again with `--confirm TOKEN` only after checking all three displayed values.
- The script arms rollback by durably writing `pending-mutation` before every remote mutation. The remote process enforces the command deadline. A longer local SSH deadline covers the remote deadline and lock wait. Failure, timeout, or interruption runs rollback and records `failed-needs-inspection`.
- A root-owned `/run/lock/korri-device-gate.lock` serializes each remote operation. A root-owned mode `0600` `/var/lib/korri-device-gate/attempt` marker and bounded systemd lease serialize the complete activation, verification, and restore or acceptance window. Both bind the private attempt nonce, exact candidate, and exact candidate helper. Every mutation and automated gate validates them.
- Another invocation cannot replace a live marker. Reconcile removes a matching stale marker only after the lease is inactive and while it holds the root operation lock, so it cannot race a live switch.
- Every automated gate and acceptance-fingerprint read after activation has both the remote wall-clock deadline and the longer local SSH deadline while rollback remains armed.
- The gate rejects another mutation from `failed-needs-inspection`. `reconcile` is read-only. It requires the rollback generation and every sanitized baseline predicate to match before it restores the prior ledger state.
- The script never retries a switch, profile change, reboot, or destructive command blindly.
- The script preserves the old `korrid.service` user-unit file. Temporary states restart the old unit if it was active. Persistent activation disables the old user unit but does not remove it, so rollback can restore it.
- The script does not run `reboot`. The operator performs each reboot as a separate HITL action, then runs the matching read-only reboot-verification state.

The cost of this design is more operator steps. It also needs a consuming NixOS configuration to build both generation paths before rollout. The gate cannot make an unsupported controller profile valid.

## Private baseline ledger

The baseline contains no configuration file contents and no journal payloads. It records:

- the machine ID and hostname;
- current and default NixOS generation links;
- InputPlumber, inputd, system korrid, old user korrid, and Sunshine unit summaries;
- sanitized physical-controller candidate identities, temporary-artifact status, and catalog health;
- exact old user active and enabled state;
- normalized and raw topology digests;
- permissions, ACL, and gameplay-user readability as one digest;
- moved-source and temporary-artifact topology as one digest;
- InputPlumber and Sunshine active and enabled state.

The gate never reads or records Sunshine pairing material. It never records game paths, catalog titles, game content, private configuration contents, credentials, or environment values.

Delete the private ledger after the final evidence has been transferred to the work ledger in sanitized form. The private ledger is operational evidence, not a repository artifact.

## Inputs

Obtain the expected identity from a separate trusted device inventory. Do not copy it from a failed gate run.

Build the candidate through the consuming NixOS configuration. Keep the active pre-rollout system closure as the rollback generation. Both paths must contain `bin/switch-to-configuration` and remain available until all reboot gates pass.

Mutation modes require the first eight arguments below. `persistent-switch`, `candidate-reboot-verify`, and reconcile after a candidate reboot verification failure also require the final two controller arguments:

```text
--host HOST
--expected-machine-id ID
--expected-hostname NAME
--candidate /nix/store/CANDIDATE
--rollback-generation /nix/store/ROLLBACK
--gameplay-user USER
--ledger PRIVATE_DIRECTORY
--confirm TOKEN
--expected-controller-id BUS:VENDOR:PRODUCT:VERSION
--production-profile korri-60-xbox_one_gamepad.yaml
```

No path above is a project schema. `CANDIDATE`, `ROLLBACK`, `USER`, and the consumer configuration remain device-owned inputs. The repository modules do not define Zao's consumer path or identity values.

## State sequence

Use one private ledger for the complete sequence. The gate rejects out-of-order states.

| State | Mode | Device mutation | Required result |
|---|---|---:|---|
| Baseline | `inspect` | No | Identity and sanitized device posture captured. |
| Failed mutation | `reconcile` | No | A fresh inspection proves the rollback generation and all sanitized predicates exactly match the baseline before retry. |
| Temporary candidate | `candidate-test` | Temporary | Candidate activates with NixOS `test`, automated and HITL gates pass, then rollback restores the prior generation and old user unit. |
| Automatic rollback | `inject-health-failure` | Temporary | The provider stops once, inputd publishes `Recovering` or `Missing`, and the prior generation restores automatically. |
| Explicit rollback | `rollback` | Persistent rollback | Candidate activates temporarily, then the system profile and runtime restore to the rollback generation. |
| Rebooted rollback | `rollback-reboot-verify` | No | Boot ID changed, rollback generation booted, and automated regression gates pass. |
| Persistent candidate | `persistent-switch` | Persistent | Candidate becomes the system profile, the old user unit is disabled but retained, and automated gates pass. |
| Rebooted candidate | `candidate-reboot-verify` | No | Boot ID changed, candidate generation booted, and automated plus HITL gates pass. |

`rollback-reboot-verify` and `candidate-reboot-verify` do not reboot the machine. Reboot only after the preceding mode exits successfully.

Persistent and candidate-reboot modes have no default controller. The operator must copy one sanitized candidate identity from `inspect`, check it against the physical controller, and pass its exact lowercase `BUS:VENDOR:PRODUCT:VERSION`. These modes accept exactly one live matching event node. The node must have non-virtual sysfs provenance, a matching live device major/minor, and `ID_INPUT_JOYSTICK=1`. The live InputPlumber composite must list that exact `/dev/input/eventN` in `SourceDevicePaths` and its `ProfilePath` must be the production package's `korri-60-xbox_one_gamepad.yaml`. The acceptance fingerprint rechecks this proof.

A synthetic controller can be used only during separate temporary preflight work. Use the exact name `Korri U7 Synthetic Controller` and a private path matching `korri-u7-device-gate.*` only for that bounded preflight. Remove both before invoking a mutation mode. The gate refuses either artifact before mutation. Synthetic, virtual, stale, unsupported, generic-joystick, and identity-mismatched evidence never satisfies persistence or reboot acceptance.

## HITL stages

The candidate remains active while a human verifies behavior that repository code cannot infer from static service state. `candidate-test`, `persistent-switch`, and candidate reboot verification prompt for all seven stage tokens. Each `/dev/tty` read and the complete HITL stage have bounded timeouts. A timeout exits through armed cleanup and rollback. Before activation, the gate generates a cryptographic per-attempt nonce and durably arms rollback. The private mode `0600` ledger and root-owned remote attempt marker record it. Each displayed token binds the machine ID, hostname, exact candidate, nonce, boot ID, ledger state, and gate. The ledger records every consumed gate and rejects reuse. Production and tests use the same controlling-terminal path. No environment variable or command argument can supply or bypass HITL tokens.

Immediately before acceptance, the gate re-reads the exact InputPlumber 0.75.2 `xb360` identity and capability fingerprint. It requires the virtual sysfs provenance, empty `phys` and `uniq`, exact keys and absolute axes, force-feedback support, joystick class, InputPlumber executable/version, event node, sysfs path, inode, and matching sysfs/device major-minor to remain unchanged. Persistent and reboot acceptance also re-read the CLI-bound physical identity and live production-profile selection.

Do not enter a token until the named stage passes.

| HITL stage | Operator action and required observation |
|---|---|
| `normalized-gameplay` | Start a fresh game process. Confirm exactly one Xbox 360 target works and no raw physical controller opens under the gameplay identity. |
| `health-recovery-ambiguity` | Disconnect and reconnect the source. Confirm `Missing`/`Recovering`, then `Ready`. Introduce one bounded second normalized test target. Confirm `Ambiguous`, no action, held-state clearing, recovery, and full cleanup. |
| `dbus-spoof-and-exclusive-grab` | Use a bounded exclusive evdev grab. Confirm the raw observer blocks while the authenticated DBus shortcut still fires. Emit the same signal from an unrelated system-bus client and confirm inputd rejects it. |
| `exact-stop-and-races` | Record one active launch ID. Complete the exact destructive hold and confirm only that launch cgroup stops. Repeat replacement, child-exit/restart, and provider/korrid restart races. Confirm stale holds never stop a replacement and korrid restart does not kill the active launch. |
| `direct-action-isolation` | Trigger a configured direct action. Inspect the child while active. Confirm separate UID/GID and cgroup, minimal allowlisted environment, closed control descriptors, no control group, no capabilities, bounded output/runtime/concurrency, and cleanup. |
| `sunshine-video-controller-recovery` | Confirm video and existing pairing presence. Test local and remote controller input through disconnect/reconnect and one Sunshine restart. Confirm one normalized target and no virtual-device feedback loop after repeated reconnects. |
| `catalog-and-session` | Confirm the local catalog is healthy without recording titles or paths. Start and stop one session and confirm session recovery remains healthy. |

The automated portion separately checks service activity, `StatusText=Ready`, one exact normalized target, normalized readability, no raw game-user readability, DBus owner/interface, cgroup v2, `Delegate=yes`, `DelegateControllers` containing `pids`, and catalog health. The two systemd properties use the values returned by `systemctl show`; `Delegate=pids` is not a valid substitute for the runtime boolean property.

## Failure handling

If a mutating state fails, allow the cleanup trap to run. Do not rerun the failed mutation. Run `reconcile` with the same explicit target, generation, gameplay-user, and ledger arguments. It compares current/default generation links, exact old-user state, target/raw topology, ACL/readability, moved-source and temporary artifacts, InputPlumber/Sunshine state, and catalog health with the private baseline. It does not mutate the device.

A gate, HITL token, SSH, or fingerprint failure during `candidate-reboot-verifying` records `failed-needs-inspection` with `resume_state=candidate-await-reboot`. Reconcile requires the candidate generation plus the same exact physical identity and production profile. It then restores `candidate-await-reboot`, so a transient failure can retry verification without repeating the persistent switch.

If cleanup reports that rollback failed, stop. Use the exact rollback generation printed in the private ledger. Do not guess another generation and do not remove the old user unit.

A missing rollback closure, host identity mismatch, missing exact physical-controller proof for persistent states, or any `Korri U7 Synthetic Controller` / `korri-u7-device-gate.*` residue is a hard stop.

## Repository verification

Run without SSH or device mutation:

```sh
./services/inputd/deploy/test-device-bitmap.sh
./services/inputd/deploy/test-device-check.sh
shellcheck services/inputd/deploy/device-check.sh services/inputd/deploy/test-device-check.sh services/inputd/deploy/test-device-bitmap.sh
```

The shell test replaces SSH with a modeled command endpoint. The models cover systemd delegation property semantics, physical identity and live production-profile selection, topology count, normalized InputPlumber provenance/capabilities, ACL exposure, baseline drift, target replacement, remote timeout, and interruption. Successful HITL tests run the production `/dev/tty` prompt path through a pseudo-terminal. The tests also prove malicious generation paths stop before SSH, remote argv stays intact, rollback is armed before mutation, a remote mutation that survives transport finishes before lock-serialized rollback, candidate reboot token/SSH failures resume through reconcile, accepted persistent state resumes without repeating mutation, and the nonce is absent from terminal output.
