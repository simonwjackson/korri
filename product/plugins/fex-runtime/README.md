# FEX runtime plugin

First-party Korri runtime plugin for launching x86_64 Linux userland payloads on aarch64 devices through FEX.

The plugin descriptor exposes `@korri:fex` runtime metadata and a `runtime.resolve` handler. The bundled `korri-fex-runtime` package provides the shell `setup-env` helper used by launchers that need the known-good Bandai FEX graphics environment.
