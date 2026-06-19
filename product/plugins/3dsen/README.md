# 3dSen plugin

`@korri:3dsen` owns Korri's app-like 3dSen integration.

A readable release selects the 3dSen app and supplies plugin policy with:

- `executableRoot`: configured staged 3dSen Linux payload directory
- `registryPath`: where 3dSen reads `rom.json`
- `profileId`: the 3dSen profile id to launch, such as `37` for Super Mario Bros.
- `profiles`: all profile-to-ROM mappings Korri should materialize before launch

Korri launches 3dSen by profile id only (`-id=<profile>`). ROM paths are written to 3dSen's registry during `launch.prepare`; they are not passed on argv.

This plugin intentionally does not include Gamescope, DSI placement, FEX, Windows/Proton 3dSen, or itch.io acquisition/import UX.
