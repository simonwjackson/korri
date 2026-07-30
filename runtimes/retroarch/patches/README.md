# com.korri.retroarch patches

Korri's Android emulation runtime is RetroArch v1.22.2 at pinned commit
`69a4f0ea1e8aaf442ae4858f2e7f2b31a1776576` plus the ordered patches in this
directory. `runtimes/retroarch/fetch-upstream.sh` verifies that pin and requires
each patch to apply exactly, without fuzz.

This pin and patch series are the complete corresponding source changes for
Korri's GPL-3.0 RetroArch distribution. Upstream source remains available from
<https://github.com/libretro/RetroArch>.

## Series

Patches are applied in lexical order. Add one independently reviewable concern
per `NNNN-description.patch` and record its upstream-facing rationale here.
