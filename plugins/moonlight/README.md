# `@korri:moonlight`

This declaration-only plugin owns Korri's stable Moonlight transport identity,
the Android Artemis implementation selection, the Sunshine app Korri attaches
to, and the streamed-session controls Artemis can fulfill.

The plugin performs no effects. On Android, Artemis remains the hardware and
protocol edge: it owns pairing certificates, host and app discovery, pairing,
the Moonlight protocol, stream Activity startup, and live `Game` effects.
korrid resolves the enabled plugin declaration first; only a successful typed
resolution permits the portal to invoke the existing narrow native discovery
and start bridge methods.

`plugin.ts` is canonical. `services/korrid/plugins/moonlight.plugin.ts` is a
relative symlink for checkout builds, while `services/korrid/package.nix`
materializes the same source bytes for hermetic builds.
