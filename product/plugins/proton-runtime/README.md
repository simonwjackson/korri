# Proton runtime plugin

First-party Korri runtime plugin for Windows x86_64 payloads that use Proton runtime files.

The initial runtime, `@korri:proton/proton-10`, resolves the Steam-installed Proton 10.0 tree already seeded on Bandai-class devices. The bundled `korri-proton-runtime` package provides a sourceable `setup-env` helper for launchers that need the known-good direct `wine64` + DXVK/VKD3D environment.
