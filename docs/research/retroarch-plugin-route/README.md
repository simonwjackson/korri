# RetroArch plugin route checkpoint

This fixture proves the legacy route shape used by Android local emulation:

- the library selects `@korri:retroarch/retroarch`;
- the release selects `@korri:mgba/mgba`;
- `@korri:retroarch` supplies the Android package, Activity, and launcher;
- `@korri:mgba` independently supplies the runtime kind, core path, and GBA
  compatibility;
- korrid resolves the file target under the fixed Android Korri storage root
  and performs configuration and launch effects.

The adjacent documents are test/device-gate fixtures. `library-wl4.yaml` is the
one-item semantic-input fixture used by RetroArch acceptance; the gate locks,
backs up, and restores the device's fixed configuration around the run. Fresh
Korri storage still creates `config.yaml` and `library.yaml` containing only
`{}`.
