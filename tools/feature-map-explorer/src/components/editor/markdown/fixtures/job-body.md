
# Job: Safe Game Resume

---

**Evidence note**: This job is based on a focused product interview, not observed usage transcripts. The interview established the trigger, success criteria, risk boundaries, and scope exclusions. Claims about player emotion and current alternatives are inferred from that interview and should be validated with future user observation.

---

## 1. Job Statement

> When I return to a game I had already chosen, I want the launcher to make continuing that game the obvious next action while checking that my progress is safe to use, so I can resume without re-browsing my library or worrying that I might lose or overwrite progress.

---

## 2. Triggering Situation

The trigger is a return moment: the player has already chosen what they are playing and is coming back after an interruption, device wake, app relaunch, session switch, or time away. The player is not asking, “What should I play?” They are asking, “How do I safely continue what I was already doing?”

This can happen on handheld devices, couch/TV setups, desktops, or any other device where the launcher is installed. The most important risk case is multi-device continuity: the player may have last played on another device, and the current launcher instance should not assume the local progress state is authoritative.

The trigger is recurring and user-initiated. It becomes urgent because the player’s intent is already formed; every extra browsing step, ambiguous state, or risky launch decision creates friction. The cost of failure is not only delay — it is anxiety that progress may be lost, overwritten, forked, or resumed from the wrong state.

---

## 3. Functional Outcome

Ordered by importance:

1. **SGR-O1 — Progress safety** *(threshold)* — Increase confidence that continuing will not risk progress loss or overwrite. The launcher should automatically perform any supported pre-launch sync or safety check before handing off to the game. If it cannot sync, cannot verify sync, or is unsure whether the current device has safe progress, it must require explicit confirmation before launch.

2. **SGR-O2 — No re-decision** *(threshold)* — Minimize the need to re-decide what to play. The previous game should be the obvious continuation target. The player should not have to browse the full library, remember the title, or reconstruct their previous intent.

3. **SGR-O3 — Low-friction resume** *(optimizing)* — Minimize avoidable pre-launch friction. Resume should avoid unnecessary menus, launcher hopping, or repeated selection steps. The player stays in control, but the happy path should be short.

4. **SGR-O4 — Explicit launch control** *(threshold)* — Preserve user control over launch. The launcher should not auto-launch games. Resume is a focused action the player confirms, not an automatic decision made on their behalf.

5. **SGR-O5 — Retry failed handoff** *(threshold)* — Report launch handoff success or failure clearly. The launcher’s core responsibility ends when the configured launch command succeeds or fails. If the command fails, the player needs a direct retry path without re-finding the game.

---

## 4. Emotional and Social Dimensions

**Emotional**: The main negative emotion is anxiety: “Am I about to lose, overwrite, or confuse my progress?” This is especially important because not every game has save states, not every device supports hibernate, and not every source exposes reliable save-sync status. The launcher should reduce uncertainty where it can and be honest where it cannot.

The positive emotional outcome is safe continuity. The player feels that the launcher remembers what they were doing, protects their progress, and does not pretend to know more than it does.

**Social**: This is primarily a private, individual job. The core stakes are the player’s own time, attention, and saved progress. Couch and shared-device contexts may add visibility or household complexity, but those are related variants rather than the center of this job.

---

## 5. Current Solutions Being Fired

**OS suspend/resume** — When available, the player wakes the device and hopes the previous game is still alive. This works well when the platform supports reliable suspend and the game survives it. It fails when the device does not hibernate, the game was closed, the process crashed, or the player returns on another device.

**Steam or console-style recent game rows** — Recent-game surfaces make the last game easy to find. They partially solve remembering and navigation. They do not always solve cross-device progress uncertainty, multiple-source ambiguity, or non-Steam/emulated/local game cases.

**Manual library navigation** — The player reopens a launcher, searches or scrolls for the game, launches it, and then loads the save in-game. This is reliable when the player remembers exactly what they want, but it wastes attention and reintroduces choice into a moment that should not require choice.

**Multiple launcher hopping** — For games spread across Steam, Epic, GOG, emulators, custom commands, or source-specific frontends, the player may need to open the right launcher first. This creates extra friction and makes it harder for the player to know which system owns save safety.

---

## 6. Obstacles

**Progress state may be unknowable** — The launcher may not know whether the latest progress is local, synced, remote, emulator-managed, or hidden behind a source launcher. Not all games support cloud sync or save states.
*Product status*: Must be handled honestly. The launcher should not imply certainty without evidence.

**The last-played device may differ from the current device** — If the player last played on another device where this launcher is installed, the current device may not have the latest safe progress.
*Product status*: This is the primary confirmation trigger. Sync/check should happen automatically when supported; if safety cannot be verified, the player must explicitly accept the risk or cancel.

**Resume can become accidental auto-launch** — A launcher that immediately starts the last game may be fast but unsafe or surprising.
*Product status*: Avoided by requiring an explicit player action before launch.

**Command handoff has limited visibility** — The launcher executes configured terminal commands. In the core model, command success means launcher handoff succeeded, even if the game later fails internally.
*Product status*: The launcher should clearly report command failure and offer retry. Future process or log watching can improve observability, but the job should not depend on universal playable-state detection.

**Different devices and input contexts need different surfaces** — Handheld resume may need one dominant thumb-friendly action; TV/couch may need a controller-friendly row or dashboard.
*Product status*: The resume surface should adapt by context while preserving the same job outcome.

---

## 7. Personas Who Perform This Job

- **Player** — The generic player returning to a game they had already chosen. This is the primary persona for the job.

Future persona variants to document separately or reference from persona files:

- **Handheld player** — Has small-screen and quick-session constraints, but the core job remains safe continuation.
- **Couch/TV player** — Uses controller-first navigation from a distance, but the core job remains safe continuation.
- **Multi-device player** — Has the strongest progress-continuity risk because the last played state may live elsewhere.
- **Power user** — May use custom launch commands, multiple sources, emulators, and logs; these increase complexity but do not change the core resume job.

---

## 8. Job Map

1. **Define** — The player has already chosen the game. They are returning to continue, not browsing for something new.

2. **Locate** — The launcher identifies the most relevant previous game and makes it the obvious continuation target without requiring full-library navigation.

3. **Prepare** — The launcher checks what it can know before launch: last played game, last played device if available, source/launcher, configured command, and supported sync/safety status.

4. **Execute** — The player explicitly activates Continue. The launcher performs supported automatic sync/check work before running the launch command.

5. **Monitor** — If sync/check succeeds or no risk is known, the launcher proceeds with the configured launch command. If sync/check fails or safety is uncertain, the launcher interrupts before launch.

6. **Modify** — When interrupted, the player can either cancel and return to the launcher or continue anyway with clear risk acknowledgment. If the launch command fails, the player can retry without re-finding the game.

7. **Conclude** — The job is complete when the launcher has safely prepared the continuation context, run the configured launch command, and reported command success or failure. Future PID/log watching may provide finer state, but command handoff is the current core completion boundary.

---

## 9. Design Implications

**Job map: Locate**
Provide a context-adaptive resume surface that makes the previous game visually dominant without forcing full-library browsing. Handheld and TV/couch layouts may differ, but both should preserve a clear Continue path.

**Obstacle: Progress state may be unknowable**
Represent progress safety as a confidence problem, not a universal sync feature. The product should distinguish between known-safe, known-risk, and unknown states internally, but only interrupt the player when the uncertainty creates plausible progress risk.

**Obstacle: Last-played device may differ from current device**
Track enough device/source context to know when a previous session occurred on another installed device. When supported, sync/check automatically before launch. If unable to verify safety, require confirmation before continuing.

**Functional outcome: Preserve user control over launch**
Do not auto-launch the previous game. Resume should be a prominent, low-friction action that the player chooses.

**Obstacle: Command handoff has limited visibility**
Treat configured command success/failure as the baseline launch result. On failure, keep the player anchored to the same resume context and provide an immediate retry action.

**Related jobs intentionally out of scope**
Choosing what to play from the broader library, installing/updating/repairing games, deep save-version management, household profile switching, and emulator-specific save-state management should be documented as separate jobs rather than folded into this one.
