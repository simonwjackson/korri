# Leaving a game and coming back — measured, 2026-07-30

Question: after `Korri → game → Korri → game`, is the game **resumed** the way
Android app switching resumes an app, or silently **restarted**?

Device: SM-F966U1 (usu), Android 16. Game: TMNT Shredder's Revenge, launched
from the portal. The tell is the game's process id across the round trip, plus
whether the game is actually on screen afterwards.

**No decision is recorded here.** This is evidence for choosing.

## Measured

| Launch model | Left the game via | Process | Outcome |
|---|---|---|---|
| Korri's own task *(shipped today)* | Back | 31436 → **31868** | **Restarted**, and the user ended on the Android home screen |
| Separate task *(experiment)* | Back | 3614 → **4869** | **Restarted**; reopening did not reach the game |
| Separate task *(experiment)* | Home | 1696 → **1696** | **Resumed** — game back on screen, place kept |

The experiment is `separate-task-launch.patch` beside this file: it adds
`FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_RESET_TASK_IF_NEEDED` for `android-app`
launches only. It was reverted after measuring. Reproduce the comparison with
`services/korrid/journey-compare.sh <serial>`. The production resume gate uses
only the successful Home/task-switch path in
`services/korrid/journey-resume.sh <serial>`; Back is intentionally not accepted
as resume evidence.

## What the numbers actually say

**Back always ends the game — in both models.** Back at a task's root activity
finishes it; Korri cannot override that. So any design where "return to Korri"
means Back can never keep a game warm.

**Only a task switch preserves state.** Home (or recents) retains the game's
task, and reopening brings it forward — same process, same place. That is
precisely the behaviour the requirement describes.

**Today's model has a second failure beyond restarting.** Launching into
Korri's task put the game on top of Korri's stack; leaving via Back tore that
stack down and stranded the user on the Android home screen rather than back
in Korri.

A caution for anyone re-testing: **process id alone is not proof.** Android
keeps recently-used processes cached, so a destroyed activity can leave a live
process behind. The first version of this harness reported "RESUMED" while the
game was not on screen at all. Any check must assert the game is topmost too.

## The three shapes

**A — launch into Korri's task** (shipped)
- Back returns to Korri, so Korri feels like it contains the game
- One entry in recents
- Back destroys the game; keeping it warm is impossible
- Observed: Korri's own task can be torn down with it

**B — launch into its own task** (measured above)
- Home/recents resume works: the stated requirement, satisfied
- Matches what users already expect from Android
- Back still ends the game — unavoidable
- The game appears as its own recents entry, so it feels less "inside" Korri
- "Return to Korri" needs to mean something other than Back

**C — overlay service** (not built; from the RetroArch transport research)
- A global Guide capture draws Korri *over* a live game: contained *and* warm
- Generalises to any launcher — RetroArch, Dolphin, GameNative
- Costs two hostile grants (display-over-other-apps, accessibility)
- Its own slice, with meaningfully more machinery

A and B are not exhaustive: C changes the trade-off by sidestepping task
semantics altogether, which is why this note stops short of recommending.

## Untested

- The full interleave `TMNT → Wario → TMNT`: usu has neither the RetroArch fork
  nor the WL4 ROM, so the second launcher could not participate. Worth redoing
  once both are present, since two launchers may behave differently.
- Recents-based return, as opposed to relaunching from the portal.
- What a stream session does across the same journey.
