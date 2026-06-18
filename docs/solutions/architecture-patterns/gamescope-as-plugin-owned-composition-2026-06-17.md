---
title: Gamescope as plugin-owned composition
date: 2026-06-17
category: architecture-patterns
module: plugins + launch-composition + nix-composition
status: active
problem_type: architecture_boundary
component: gamescope-plugin
severity: high
applies_when:
  - Adding or moving Gamescope-related behavior
  - Authoring launch.with config for first-party plugins
  - Composing product images or runtime registries with optional plugins
  - Reviewing generic platform, service, app, theme, or Nix code for plugin coupling
tags: [plugins, gamescope, launch-with, nix, stream-control, sessiond]
---

# Gamescope as plugin-owned composition

## Context

Gamescope is a first-party Korri plugin, not a built-in Korri platform concept. The platform owns generic provider maps, plugin registries, launch companion dispatch, stream-control metadata/action transport, session lifecycle hook points, and structured diagnostics. The Gamescope plugin owns the provider id, policy payload shape, launch wrapping, runtime-control protocol, stream-control definitions, session cleanup/control-bridge behavior, and plugin-owned Nix artifacts.

The authored config shape stays stable:

```yaml
launch:
  with:
    "@korri:gamescope":
      enable: true
      backend:
        type: wayland
```

That key is a provider entry in the open `launch.with` map. It is not a top-level core field and it is not a Moonlight setting.

## Boundary rule

Generic Korri code does not name Gamescope. That includes platform, services, apps, themes, and reusable Nix modules/images/overlays. Generic code receives provider-keyed data, metadata, handlers, diagnostics, and lifecycle hooks through host seams.

Allowed Gamescope naming locations are narrow:

- `product/plugins/gamescope/**`, where the plugin owns implementation, tests, Nix fragments, packages, policy schemas, and runtime protocol details.
- Explicit product/runtime/image composition entrypoints whose job is to register or enable first-party plugins.
- Durable docs, work-item prose, and readable config examples that explain the boundary or teach authoring.

Allowlisted composition files must remain composition files. They may select or register the plugin, but they must not become reusable helpers that smuggle Gamescope semantics back into platform, service, app, theme, or generic Nix code.

## Runtime composition

Products and images opt into Gamescope structurally by enabling the plugin in composition. A target image may enable the plugin by default, but a no-Gamescope composition must still evaluate and keep generic services usable.

When an authored launch references a provider that is absent, disabled, lacks the required operation, or rejects its payload, dry-run and actual launch return structured plugin diagnostics before process spawn. Listing the library and launching unrelated entries remain generic operations and should not require the missing plugin.

## Config authoring

Config authors compose launch companions through `launch.with` entries keyed by provider id. The platform decodes that map generically; provider-specific validation and folding belong to the enabled plugin.

Guidance for examples and docs:

- Show Gamescope under `launch.with."@korri:gamescope"`, never as a retired top-level `gamescope` field.
- Describe Gamescope as a plugin launch companion, not as a core launch field.
- Do not imply Moonlight selects or validates Gamescope. If a streamed Moonlight client needs a Gamescope-wrapped foreground surface, author that companion entry explicitly.
- Keep multi-plugin control coordination out of examples until Korri has a generic authored-control model.

## Nix composition

Generic Nix modules do not declare Gamescope-specific options, package overrides, environment variables, or comments. The Gamescope plugin owns its packages and fragments. Product/image composition may opt into those plugin-owned artifacts and may expose plugin resources to runtime services through generic plugin composition outputs.

This preserves two valid postures:

- Enabled target composition: the product/image includes the Gamescope plugin and receives its packages, apps, environment fragments, launch companion behavior, stream controls, and session hooks.
- Disabled target composition: the product/image omits the plugin and does not require Gamescope packages, commands, environment, or overlays to evaluate.

## Deferred follow-ups

This boundary intentionally does not recreate sibling-plugin knowledge in another location.

- Generic plugin composition diagnostics for cross-plugin launch constraints: backlog `01KVBNK266WD0D4GX2DSABA9QG`.
- Generic authored coordination for multi-plugin stream controls: backlog `01KVBPNPXZ3X49XSCFXPY6CVW8`.

Until those ship, authors express desired plugin composition directly, and generic Korri surfaces report missing or unsupported plugin operations with structured diagnostics.
