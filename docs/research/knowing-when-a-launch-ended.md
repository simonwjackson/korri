# Knowing when a launch ended — 2026-07-31

Android announces what comes forward and says nothing about what goes away.
korrid therefore has to own launch records and decide for itself when one is
over. The obvious handle is the pid captured at launch. This is what that
handle is actually worth.

Measured on usu (SM-F966U1) with TMNT, walking a launch through its whole life.

## A pid does not mean a game is being played

| step | pid | still there? |
|---|---|---|
| playing | 26525 | — |
| backgrounded with HOME | 26525 | yes |
| **quit with Back** | **26525** | **yes** |
| 20 s after quitting | 26525 | yes |
| force-stopped | – | no |

Back ends a game — Android finishes the task-root activity, measured
separately in `returning-to-a-running-game.md` — yet the process was still
alive twenty seconds later. Android keeps it cached: alive, killable, and not
being played.

So a launch record keyed on pid alone would show *Now Playing* for a game the
player had already quit. This is the same trap that made a dead activity read
as `RESUMED` earlier in this project, arriving from a different direction.

**The asymmetry is the usable part:**

- **pid gone → the launch is definitely over.** Force-stop was the only state
  where the process disappeared, and it disappeared immediately.
- **pid present → nothing is proven.** Playing, backgrounded and quit are
  indistinguishable by existence.

## Two candidate replacements, both unmeasured

Neither of these should be believed yet — the probes failed, and a failed probe
is not a finding about Android:

- `/proc/<pid>/oom_score_adj` read `0` in every state including cached, which
  contradicts how Android is documented to work. Almost certainly a bad read
  rather than a real result.
- `dumpsys activity processes <pkg>` reported `curProcState=12` in all three
  states; the grep is likely matching the wrong record.

Recording them as unresolved rather than dressing up two broken measurements as
evidence that Android cannot tell us.

## The signal that does work

The accessibility service's foreground stream reported package and class
correctly all day, including under a game holding input focus. Its known gap is
the same one this document started with: it announces arrivals, never
departures.

## Shape this suggests

Close a launch record only on positive evidence, and say something honest when
there is none:

- **process gone** — definitive, cheap to poll, already proven.
- **Korri itself ended it** — korrid stopped the session, so korrid knows.
- **otherwise, do not claim the game is running.** "Last played 5 minutes ago"
  is true; "Now Playing" is a guess that today's measurement shows would often
  be wrong.

`pid_max` on this device is 32768, so pid reuse is possible in principle. It
did not need testing to matter: any record keyed on pid should also carry the
package name and the launch time, so a recycled pid cannot resurrect a finished
launch.

---

## Correction — the finding above is wrong

The table showing a process alive twenty seconds after Back was measuring a
mislabelled step. TMNT very likely never quit in that run: the two Back presses
moved around inside the game's menus, and the row called
"quit with Back" was a game still legitimately running.

Re-measured with a quit that actually took:

| step | in memory | 
|---|---|
| playing | yes (31026) |
| pressed HOME | yes |
| **pressed BACK (quit)** | **gone** |
| 15 s later | gone |

**When the game genuinely ends, its process disappears immediately.** Watching
for that absence is enough to close a launch record, and needs no cleverness.

So the alarming conclusion — that korrid would show *Now Playing* for a game
the player had left — was a measurement error, not a property of Android. The
`Away` state it argued for may still be worth having for "not looking at it
right now", but it is not forced by an inability to detect endings.

Two more signals from the re-run are junk and must not be used: an
`ActivityRecord` count reported 1 while nothing was running at all, and the
recents count sat at 8 in every state.

Residual uncertainty worth keeping: Android *can* park a finished app in memory
when it is not short of space. It did not here. Absence therefore proves an
ending; presence is weaker evidence.

The lesson is the same one this project keeps relearning, and this time it cost
a wrong document: a test that produces a confident number is not the same as a
test that did what its label claims.
