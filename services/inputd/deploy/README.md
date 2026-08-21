# Linux input development and deployment

Routine development does not use a NixOS activation. Run `nix run .#korri-dev` to start isolated korrid and inputd processes. Physical input and all actions are disabled by default. `nix run .#korri-dev -- --physical` opts in to the existing validated normalized InputPlumber target, but actions remain disabled.

The optional NixOS host layer imports `nixosModules.korri-bundle` and enables `services.korriBundle`. It installs stable units and initializes `/nix/var/nix/gcroots/korri-bundle/active` once. The active and previous selectors are Nix garbage-collection roots, so both exact bundles remain available for rollback. Each unit uses `korri-bundle-launch` to validate the selected immutable bundle and execute one fixed component without a shell. `nix run .#korri-bundle-select -- switch BUNDLE SYSTEMCTL` changes only that root-owned selector, restarts only InputPlumber, inputd, and korrid, waits for their health, and restores the prior selector if the candidate fails. It does not run `switch-to-configuration`, reload Home Manager, or restart unrelated user services.

A complete NixOS activation remains necessary only when the stable host layer changes, such as users, groups, udev rules, Polkit policy, kernel settings, or unit structure. Treat that operation as maintenance work that needs explicit approval.

## Full host maintenance gate

`device-check.sh` is the repository-side gate for a reversible NixOS rollout on one explicit device. It does not contain a default host. It does not discover devices.

The gate is read-only unless `--mode` selects a mutation state. Every invocation requires the candidate generation, expected machine ID, expected hostname, and gameplay user. Before identity inspection, it requires the exact candidate helper at `CANDIDATE/sw/bin/korri-device-gate` to be root-owned, executable, non-writable store content whose SHA-256 matches the local gate source.

## Safety contract

- Default `inspect` mode only reads state. It captures the result in a mode `0700` temporary directory, prints the sanitized result, and removes the temporary directory on exit.
- Before the first SSH call, every mode requires strict canonical Nix generation path syntax for the candidate. Mutation and reconcile modes also require it for rollback. Remote preflight proves that both exact paths exist and contain `switch-to-configuration`.
- The inputd package installs the byte-identical gate as `bin/korri-device-gate`. The NixOS module places it in the candidate system closure. The root-owned systemd attempt holder receives only the immutable candidate `sw/bin` path so the byte-identical `env bash` helper and bounded holder command resolve without an interactive-shell environment. The rollout never uploads or runs a writable script with `sudo`.
- Every SSH command uses a shell-escaped argv plus a local transport deadline and an appropriate remote command deadline. The default 570-second remote mutation bound covers the measured full agenix/Home Manager NixOS transition plus a user-manager credential restart; the longer local bound lets the remote timeout release the root lock before cleanup. Tests override these bounds to prove timeout rollback. Candidate, rollback, user, and helper paths never enter unquoted remote shell text.
- A mutation also requires a mode `0700` ledger outside the repository, an explicit gameplay user, and a confirmation token bound to the captured machine ID, hostname, and exact candidate generation.
- The script prints the required confirmation token when it is absent. Run the same command again with `--confirm TOKEN` only after checking all three displayed values.
- The script arms rollback in two durable phases before every remote mutation. It first stores a cryptographic nonce in `pending-mutation-starting`, creates the matching remote marker and lease, and only then writes marker-required `pending-mutation`. The remote process enforces the command deadline. A longer local SSH deadline covers the remote deadline and lock wait. Failure, timeout, or interruption runs rollback and records `failed-needs-inspection`.
- A root-owned `/run/lock/korri-device-gate.lock` serializes each remote operation. A root-owned mode `0600` `/var/lib/korri-device-gate/attempt` marker and bounded systemd lease serialize the complete activation, verification, and restore or acceptance window. Both bind the private attempt nonce, exact candidate, and exact candidate helper. Every mutation and automated gate validates them.
- Another invocation cannot replace a live marker. Reconcile removes a matching stale marker only after the lease is inactive and while it holds the root operation lock, so it cannot race a live switch. A marker-required in-progress ledger requires the marker to exist and match its exact nonce and candidate. A `*-starting` ledger permits no marker, but still requires its stored nonce and the state-specific rollback or candidate checks before it can return to its resume state. If a starting state has a marker, reconcile applies the same exact-match and active-lease rules.
- Every automated gate and acceptance-fingerprint read after activation has both the remote wall-clock deadline and the longer local SSH deadline while rollback remains armed.
- The gate rejects another mutation from `failed-needs-inspection`. `reconcile` is read-only. It requires the rollback generation and every sanitized baseline predicate to match before it restores the prior ledger state.
- The script never retries a switch, profile change, reboot, or destructive command blindly.
- Every user-scope systemd operation resolves the explicit gameplay user's UID, then uses `sudo -n -u USER` with `XDG_RUNTIME_DIR=/run/user/UID` and `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/UID/bus`. It never infers a user from `SUDO_UID`. Manager or transport errors fail the gate instead of becoming inactive or disabled state. The gate captures `korrid.service`, `sunshine.service`, and `x11-headless.service` separately. It preserves each old user-unit file and restores each active/enabled pair exactly.
- Before each candidate or rollback mutation, the gate queries the exact local korrid control socket when it exists and lists live `korri-game-*.service` units. `running`, `stopping`, any unknown local status, or any activating/active/reloading/deactivating Korri game unit blocks mutation. The gate never stops a game to make rollout proceed.
- Candidate activation first stops all three old user units, proves they are inactive, and tightens Sunshine state modes before a candidate system service can start. It then switches to the candidate, reloads the user manager so the removed immutable global unit links disappear, disables the retained user-unit files, and proves they remain inactive and disabled. It then restarts the gameplay user's systemd manager, starts the system `x11-headless.service`, `korrid.service`, and `sunshine.service` replacements, and verifies their declared process credentials.
- Rollback stops and disables all three system replacements, restores the exact prior generation, restarts the user manager under rollback groups, and then restores all six old user-unit state predicates. Enablement restoration is independent. Active units start in dependency order: X11 headless, Sunshine, then korrid. A failed active-game check leaves the current generation and game untouched, so manual inspection is required.
- The script does not run `reboot`. The operator performs each reboot as a separate HITL action, then runs the matching read-only reboot-verification state.

The cost of this design is more operator steps. It also needs a consuming NixOS configuration to build both generation paths before rollout. The gate cannot make an unsupported controller profile valid.

## Private baseline ledger

The baseline contains no configuration file contents and no journal payloads. It records:

- the machine ID and hostname;
- current and default NixOS generation links;
- InputPlumber, inputd, and system/user summaries for korrid, Sunshine, and X11 headless;
- sanitized physical-controller candidate identities, temporary-artifact status, and catalog health;
- exact active and enabled state for each old user korrid, Sunshine, and X11 headless unit;
- exact active and enabled state for each same-named system unit;
- normalized and raw topology digests;
- permissions, ACL, and gameplay-user readability as one digest;
- moved-source and temporary-artifact topology as one digest;
- InputPlumber active and enabled state;
- Sunshine pairing-state file presence plus sanitized directory/file modes.

The observed Sunshine baseline grounds the presence check at the gameplay user's `.config/sunshine/sunshine_state.json`. The gate resolves the gameplay UID and home. It requires the Sunshine directory and state file to be non-symlink directory/file objects owned by that UID, and their resolved paths must stay inside the gameplay home's real `.config` tree. Before candidate Sunshine starts, the gate changes only those two modes to `0700` and `0600`; every rollback restores the exact captured baseline modes before the old user service restarts. It never opens, hashes, copies, moves, or prints the state file and does not read or change `sunshine.conf`, `apps.json`, or other Sunshine configuration. Pairing contents stay unchanged and redacted.

The gate never records game paths, catalog titles, game content, private configuration contents, credentials, or environment values.

Delete the private ledger after the final evidence has been transferred to the work ledger in sanitized form. The private ledger is operational evidence, not a repository artifact.

## Inputs

Obtain the expected identity from a separate trusted device inventory. Do not copy it from a failed gate run.

Build the candidate through the consuming NixOS configuration. Import `nixosModules.korri-input` and configure the module through `services.korriLinuxInput`. The flake output name stays `nixosModules.korri-input`; the option namespace does not reuse the legacy `services.korri.input` tree. Enable `services.korriLinuxInput.provider` and `services.korriLinuxInput.inputd` independently for the device capabilities in the candidate.

Keep the active pre-rollout system closure as the rollback generation. Both paths must contain `bin/switch-to-configuration` and remain available until all reboot gates pass.

Mutation modes require the first eight arguments below. `candidate-test`, `persistent-switch`, `candidate-reboot-verify`, and reconcile after candidate verification also require the final two controller arguments:

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
| Temporary candidate | `candidate-test` | Temporary | Candidate activates with NixOS `test`, automated and HITL gates pass, then rollback restores the prior generation and all three old user units. |
| Automatic rollback | `inject-health-failure` | Temporary | The provider stops once, inputd publishes `Recovering` or `Missing`, and the prior generation restores automatically. |
| Explicit rollback | `rollback` | Persistent rollback | Candidate activates temporarily, then the system profile and runtime restore to the rollback generation. |
| Rebooted rollback | `rollback-reboot-verify` | No | Boot ID changed, rollback generation booted, and automated regression gates pass. |
| Persistent candidate | `persistent-switch` | Persistent | Candidate becomes the system profile, all three old user units stay disabled but retained, the user manager is fresh, and automated gates pass. |
| Rebooted candidate | `candidate-reboot-verify` | No | Boot ID changed, candidate generation booted, and automated plus HITL gates pass. |

`rollback-reboot-verify` and `candidate-reboot-verify` do not reboot the machine. Reboot only after the preceding mode exits successfully.

Candidate, persistent, and candidate-reboot modes have no default controller. The operator copies one sanitized identity from `inspect`, checks it against the physical controller, and passes its exact lowercase `BUS:VENDOR:PRODUCT:VERSION`. Pre-activation validates exactly one live non-virtual node with that identity, matching device major/minor, and `ID_INPUT_JOYSTICK=1`; it does not require the rollback provider to expose the candidate profile. While the candidate is active, its InputPlumber composite must list that exact `/dev/input/eventN` in `SourceDevicePaths`, and its `ProfilePath` must be the production package's `korri-60-xbox_one_gamepad.yaml`. Candidate-test records this proof. Persistent switch requires that prior evidence and rechecks the live physical identity before activation; the acceptance fingerprint rechecks full profile selection after activation.

A synthetic controller can be used only during separate temporary preflight work. Use the exact name `Korri U7 Synthetic Controller` and a private path matching `korri-u7-device-gate.*` only for that bounded preflight. Remove both before invoking a mutation mode. The gate refuses either artifact before mutation. Synthetic, virtual, stale, unsupported, generic-joystick, and identity-mismatched evidence never satisfies persistence or reboot acceptance.

## HITL stages

The candidate remains active while a human verifies behavior that repository code cannot infer from static service state. `candidate-test`, `persistent-switch`, and candidate reboot verification prompt for all seven stage tokens. Each `/dev/tty` read and the complete HITL stage have bounded timeouts. A timeout exits through armed cleanup and rollback. Before activation, the gate generates a cryptographic per-attempt nonce and durably stores it in a marker-not-yet-required starting state. After the root-owned remote marker and lease start successfully, the gate durably transitions to the marker-required in-progress state. Candidate reboot verification never writes an in-progress state without that nonce. Each displayed token binds the machine ID, hostname, exact candidate, nonce, boot ID, ledger state, and gate. The ledger records every consumed gate and rejects reuse. Production and tests use the same controlling-terminal path. No environment variable or command argument can supply or bypass HITL tokens.

Immediately before acceptance, the gate re-reads the exact InputPlumber 0.75.2 `xb360` identity and capability fingerprint. It requires the virtual sysfs provenance, empty `phys` and `uniq`, exact keys and absolute axes, force-feedback support, joystick class, InputPlumber executable/version, event node, sysfs path, inode, and matching sysfs/device major-minor to remain unchanged. Persistent and reboot acceptance also re-read the CLI-bound physical identity and live production-profile selection.

Do not enter a token until the named stage passes.

| HITL stage | Operator action and required observation |
|---|---|
| `normalized-gameplay` | Start a fresh game process. Confirm exactly one Xbox 360 target works and no raw physical controller opens under the gameplay identity. |
| `health-recovery-ambiguity` | Disconnect and reconnect the source. Confirm `Missing`/`Recovering`, then `Ready`. Introduce one bounded second normalized test target. Confirm `Ambiguous`, no action, held-state clearing, recovery, and full cleanup. |
| `dbus-spoof-and-exclusive-grab` | Use a bounded exclusive evdev grab. Confirm the raw observer blocks while the authenticated DBus shortcut still fires. Emit the same signal from an unrelated system-bus client and confirm inputd rejects it. |
| `exact-stop-and-races` | Record one active launch ID. Complete the exact destructive hold and confirm only that launch cgroup stops. Repeat replacement, child-exit/restart, and provider/korrid restart races. Confirm stale holds never stop a replacement and korrid restart does not kill the active launch. |
| `direct-action-isolation` | Trigger a configured direct action. Inspect the child while active. Confirm separate UID/GID and cgroup, minimal allowlisted environment, closed control descriptors, no control group, no capabilities, bounded output/runtime/concurrency, and cleanup. |
| `sunshine-video-controller-recovery` | Confirm video and existing pairing presence. Test local and remote controller input through disconnect/reconnect and one system Sunshine restart. Confirm one normalized target and no virtual-device feedback loop after repeated reconnects. |
| `catalog-and-session` | Confirm the local catalog is healthy without recording titles or paths. Start and stop one session and confirm session recovery remains healthy. |

The automated portion separately requires active system InputPlumber, inputd, korrid, X11 headless, and Sunshine services. It requires `StatusText=Ready`, the Sunshine pairing-state file presence boolean, one exact normalized target, normalized readability, no raw game-user readability, DBus owner/interface, cgroup v2, `Delegate=yes`, `DelegateControllers` containing `pids`, and catalog health.

For korrid, X11 headless, Sunshine, and inputd, the gate requires an explicit unit `User`, a Nix-store unit fragment, a live main PID, and process UID/GID values that match the unit declaration. It reads `/proc/PID/status` `Groups` for those processes, the gameplay user manager, and each live `korri-game-*.service` process. It rejects primary and supplementary `input` and `uinput` everywhere. It rejects supplementary and primary `korri-control` everywhere except inputd, whose primary group must be `korri-control`. It rejects primary or supplementary `korri-sunshine-uinput` everywhere except Sunshine, where that group must be supplementary. Required `video` and `render` groups remain allowed. The gameplay account also must lack all four groups.

The raw-readable scan skips only the event node whose complete normalized fingerprint still equals the verified fingerprint. A physical joystick with the same `Microsoft X-Box 360 pad` name remains raw and causes failure when the gameplay user can read it. The two inputd delegation properties use the values returned by `systemctl show`; `Delegate=pids` is not a valid substitute for the runtime boolean property.

## Failure handling

If a mutating state fails, allow the cleanup trap to run. Do not rerun the failed mutation. Run `reconcile` with the same explicit target, generation, gameplay-user, and ledger arguments. It compares current/default generation links, all three old user-unit state pairs, all three system-unit state pairs, target/raw topology, ACL/readability, moved-source and temporary artifacts, InputPlumber state, pairing-state presence and modes, and catalog health with the private baseline. The rebooted rollback uses the same complete comparison. Reconcile does not mutate the device.

SIGKILL can bypass local cleanup and leave `pending-mutation`, `rollback-reboot-verifying`, `candidate-reboot-verifying`, or their `*-starting` states. Marker-required states require the exact nonce/candidate marker. Starting states can reconcile without a marker; an existing marker must match exactly. Any active matching lease blocks reconcile. Pending mutation requires the rollback generation and complete baseline. Rollback reboot verification also reruns rollback gates under a fresh bounded lease. Candidate reboot verification requires the candidate generation, exact controller/profile, complete automated gates, and an unchanged acceptance fingerprint under a fresh bounded lease. Only successful checks restore the ledger's explicit resume state. A failed check records `failed-needs-inspection`.

A gate, HITL token, SSH, or fingerprint failure during `candidate-reboot-verifying` records `failed-needs-inspection` with `resume_state=candidate-await-reboot`. Reconcile requires the candidate generation plus the same exact physical identity and production profile. It then restores `candidate-await-reboot`, so a transient failure can retry verification without repeating the persistent switch.

If cleanup reports that rollback failed, stop. Use the exact rollback generation printed in the private ledger. Do not guess another generation and do not remove any old user unit.

A missing rollback closure, host identity mismatch, missing exact physical-controller proof for persistent states, or any `Korri U7 Synthetic Controller` / `korri-u7-device-gate.*` residue is a hard stop.

## Repository verification

Run without SSH or device mutation:

```sh
./services/inputd/deploy/test-device-bitmap.sh
./services/inputd/deploy/test-device-check.sh
shellcheck services/inputd/deploy/device-check.sh services/inputd/deploy/test-device-check.sh services/inputd/deploy/test-device-bitmap.sh
```

The shell test replaces SSH with a modeled command endpoint and exercises the production process-group policy directly. It covers all 64 active/enabled combinations for the three old user units, dependency-ordered active restoration, independent enablement restoration, error-aware user-manager queries, explicit gameplay-user manager addressing from root and a different SSH user, process primary- and supplementary-group rejection for services, games, and the gameplay user manager, no-follow pairing-state proof, stale user-manager credentials, active-game refusal through exact status and live units, candidate system-service failure, complete replacement shutdown and old-unit restoration, pairing presence, two-phase SIGKILL windows, systemd delegation semantics, physical identity and live production-profile selection, topology count, normalized InputPlumber provenance/capabilities, ACL exposure, baseline drift, target replacement, remote timeout, and interruption. Successful HITL tests run the production `/dev/tty` prompt path through a pseudo-terminal. The tests also prove malicious generation paths stop before SSH, remote argv stays intact, rollback is armed before mutation, a remote mutation that survives transport finishes before lock-serialized rollback, candidate reboot token/SSH failures resume through reconcile, accepted persistent state resumes without repeating mutation, and the nonce is absent from terminal output.
