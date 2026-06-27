# Steam plugin

First-party `@korri:steam` plugin descriptor for the Steam app provider.

- Plugin id: `@korri:steam`
- App id: `@korri:steam/steam`
- Steam-specific authored policy lives under `plugin."@korri:steam"`.
- Gamescope launch composition is expressed through `launch.with."@korri:gamescope"`; this plugin does not default-enable Gamescope or Steam globally.
- Steam owns its mutable client/runtime files after seed/bootstrap. Korri owns the declared channel policy, Proton compatibility-tool declarations, VDF/config materialization, service envelope, and explicit recovery helper.
