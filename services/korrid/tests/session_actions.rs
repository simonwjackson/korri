use axum::{
    body::{to_bytes, Body},
    http::{header, Request, StatusCode},
};
use korrid::config::resolver::{
    resolve_moonlight_transport, resolve_session_controls, ActiveRouteContext, RouteContribution,
    RoutePlatform, SessionExecutorAvailability,
};
use korrid::plugin::{
    load_plugin_source, PluginRegistry, SessionControlExecutor, SessionControlOwnerKind,
};
use tower::ServiceExt;

const CANONICAL_MOONLIGHT_PLUGIN: &str = include_str!("../../../plugins/moonlight/plugin.ts");

const MOONLIGHT_PLUGIN: &str = r#"
({
  namespace: "@korri",
  name: "moonlight",
  title: "Moonlight",
  contributes: {
    config: {
      transports: {
        moonlight: { id: "@korri:moonlight/moonlight" },
      },
    },
    sessionControls: {
      disconnect: {
        id: "@korri:moonlight/disconnect",
        owner: { kind: "transport", id: "@korri:moonlight/moonlight" },
        label: "Disconnect",
        description: "Leave the host game running",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/disconnect",
        destructive: true,
        dismissOnSuccess: true,
      },
      fill: {
        id: "@korri:moonlight/fill",
        owner: { kind: "transport", id: "@korri:moonlight/moonlight" },
        label: "Fill screen",
        interaction: { kind: "toggle" },
        effect: "@korri:moonlight/set-fill-mode",
      },
      mouseMode: {
        id: "@korri:moonlight/mouse-mode",
        owner: { kind: "transport", id: "@korri:moonlight/moonlight" },
        label: "Mouse mode",
        interaction: {
          kind: "choice",
          options: [
            { value: "trackpad", label: "Trackpad" },
            { value: "direct", label: "Direct" },
          ],
        },
        effect: "@korri:moonlight/set-mouse-mode",
      },
      sharpness: {
        id: "@korri:moonlight/sharpness",
        owner: { kind: "transport", id: "@korri:moonlight/moonlight" },
        label: "Sharpness",
        interaction: { kind: "range", min: 0, max: 100, step: 5 },
        effect: "@korri:moonlight/set-sgsr-sharpness",
      },
    },
  },
})
"#;

const RETROARCH_PLUGIN: &str = r#"
({
  namespace: "@korri",
  name: "retroarch",
  title: "RetroArch",
  contributes: {
    config: {
      launchers: {
        retroarch: {
          id: "@korri:retroarch/retroarch",
          plugin: "@korri:retroarch",
          command: "retroarch",
          android: {
            packageName: "com.korri.retroarch",
            className: "com.retroarch.browser.retroactivity.RetroActivityFuture",
          },
        },
      },
    },
    sessionControls: {
      openMenu: {
        id: "@korri:retroarch/open-menu",
        owner: { kind: "launcher", id: "@korri:retroarch/retroarch" },
        label: "Open RetroArch menu",
        interaction: { kind: "command" },
        effect: "@korri:retroarch/open-menu",
        dismissOnSuccess: true,
      },
    },
  },
})
"#;

fn registry(enabled: &[&str]) -> PluginRegistry {
    PluginRegistry::new(
        vec![
            load_plugin_source(MOONLIGHT_PLUGIN).expect("Moonlight declaration"),
            load_plugin_source(RETROARCH_PLUGIN).expect("RetroArch declaration"),
        ],
        enabled.iter().map(|id| (*id).to_owned()),
    )
    .expect("session-control registry")
}

fn android_route(executors: &[SessionControlExecutor]) -> ActiveRouteContext {
    ActiveRouteContext {
        platform: RoutePlatform::Android,
        contributors: vec![
            RouteContribution {
                kind: SessionControlOwnerKind::Transport,
                id: "@korri:moonlight/moonlight".into(),
            },
            RouteContribution {
                kind: SessionControlOwnerKind::Launcher,
                id: "@korri:retroarch/retroarch".into(),
            },
        ],
        executor_availability: SessionExecutorAvailability::from_available(
            executors.iter().copied(),
        ),
    }
}

#[test]
fn active_route_owns_the_only_controls_that_resolve_in_deterministic_order() {
    let registry = registry(&["@korri:moonlight", "@korri:retroarch"]);
    let context = android_route(&[
        SessionControlExecutor::AndroidMoonlight,
        SessionControlExecutor::RetroarchControl,
    ]);

    let controls = resolve_session_controls(&registry, &context);
    assert_eq!(
        controls
            .iter()
            .map(|control| control.id.as_str())
            .collect::<Vec<_>>(),
        [
            "@korri:moonlight/disconnect",
            "@korri:moonlight/fill",
            "@korri:moonlight/mouse-mode",
            "@korri:moonlight/sharpness",
            "@korri:retroarch/open-menu",
        ]
    );
    assert_eq!(controls[0].plugin_id, "@korri:moonlight");
    assert_eq!(controls[4].plugin_id, "@korri:retroarch");

    let reversed_route = ActiveRouteContext {
        contributors: context.contributors.iter().cloned().rev().collect(),
        ..context.clone()
    };
    assert_eq!(
        resolve_session_controls(&registry, &reversed_route)
            .iter()
            .map(|control| control.id.as_str())
            .collect::<Vec<_>>(),
        [
            "@korri:retroarch/open-menu",
            "@korri:moonlight/disconnect",
            "@korri:moonlight/fill",
            "@korri:moonlight/mouse-mode",
            "@korri:moonlight/sharpness",
        ]
    );

    let retroarch_only = ActiveRouteContext {
        contributors: vec![RouteContribution {
            kind: SessionControlOwnerKind::Launcher,
            id: "@korri:retroarch/retroarch".into(),
        }],
        ..context
    };
    assert_eq!(
        resolve_session_controls(&registry, &retroarch_only)
            .iter()
            .map(|control| control.id.as_str())
            .collect::<Vec<_>>(),
        ["@korri:retroarch/open-menu"]
    );
}

#[test]
fn canonical_moonlight_resolves_typed_artemis_availability_only_when_enabled() {
    let plugin = load_plugin_source(CANONICAL_MOONLIGHT_PLUGIN).expect("Moonlight declaration");
    let enabled = PluginRegistry::new(vec![plugin.clone()], vec!["@korri:moonlight".to_owned()])
        .expect("enabled Moonlight registry");

    let resolved = resolve_moonlight_transport(&enabled, RoutePlatform::Android)
        .expect("Android Artemis should be available");
    assert_eq!(resolved.transport_id, "@korri:moonlight/moonlight");
    assert_eq!(resolved.implementation.as_str(), "artemis");
    assert_eq!(resolved.sunshine_app, "Korri Stream");
    let controls = resolve_session_controls(
        &enabled,
        &ActiveRouteContext {
            platform: RoutePlatform::Android,
            contributors: vec![RouteContribution {
                kind: SessionControlOwnerKind::Transport,
                id: resolved.transport_id.clone(),
            }],
            executor_availability: SessionExecutorAvailability::from_available([
                SessionControlExecutor::AndroidMoonlight,
            ]),
        },
    );
    assert_eq!(controls.len(), 18);

    let disabled = PluginRegistry::new(vec![plugin], Vec::new())
        .expect("disabled Moonlight should remain registered");
    assert!(resolve_moonlight_transport(&disabled, RoutePlatform::Android).is_none());
    assert!(resolve_moonlight_transport(&enabled, RoutePlatform::Linux).is_none());
}

#[test]
fn platform_and_live_executor_availability_are_both_required() {
    let registry = registry(&["@korri:moonlight", "@korri:retroarch"]);

    assert!(resolve_session_controls(&registry, &android_route(&[])).is_empty());

    let linux = ActiveRouteContext {
        platform: RoutePlatform::Linux,
        contributors: vec![RouteContribution {
            kind: SessionControlOwnerKind::Launcher,
            id: "@korri:retroarch/retroarch".into(),
        }],
        executor_availability: SessionExecutorAvailability::from_available([
            SessionControlExecutor::RetroarchControl,
        ]),
    };
    assert!(resolve_session_controls(&registry, &linux).is_empty());
}

#[tokio::test]
async fn rpc_list_and_invoke_stay_unavailable_without_current_route_context() {
    let root = tempfile::tempdir().expect("host fixture");
    let config = root.path().join("host.toml");
    std::fs::write(&config, "label = \"test\"\n").expect("host config");
    let app = korrid::host_router(&config);

    for request in [
        r#"{"_tag":"app.session.controls","payload":{"launchId":"launch-1"}}"#,
        r#"{"_tag":"app.session.control.invoke","payload":{"launchId":"launch-1","controlId":"@korri:retroarch/open-menu"}}"#,
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/rpc")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(request))
                    .expect("RPC request"),
            )
            .await
            .expect("RPC response");
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("RPC response body");
        let body: serde_json::Value = serde_json::from_slice(&body).expect("tagged RPC JSON");
        assert_eq!(body["outcome"]["_tag"], "Err");
        assert_eq!(body["outcome"]["payload"]["reason"], "Unavailable");
        assert!(body["outcome"]["payload"]["message"]
            .as_str()
            .expect("failure message")
            .contains("current active-session route"));
    }
}

#[tokio::test]
async fn brain_rpc_publishes_resolved_artemis_and_honors_user_disable() {
    let root = tempfile::tempdir().expect("Moonlight config root");
    std::fs::write(root.path().join("config.yaml"), "{}\n").expect("default config");
    std::fs::write(root.path().join("library.yaml"), "{}\n").expect("empty library");
    let app = korrid::router_with_capability_and_local_root(
        "moonlight-test-capability",
        "https://appassets.androidplatform.net",
        root.path(),
    );

    let request = || {
        Request::builder()
            .method("POST")
            .uri("/rpc")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::AUTHORIZATION, "Bearer moonlight-test-capability")
            .body(Body::from(
                r#"{"_tag":"app.moonlight.resolve","payload":{}}"#,
            ))
            .expect("Moonlight RPC request")
    };

    let response = app
        .clone()
        .oneshot(request())
        .await
        .expect("Moonlight RPC response");
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("Moonlight RPC body");
    let body: serde_json::Value = serde_json::from_slice(&body).expect("typed response");
    assert_eq!(body["outcome"]["_tag"], "Available");
    assert_eq!(
        body["outcome"]["payload"],
        serde_json::json!({
            "transportId": "@korri:moonlight/moonlight",
            "implementation": "artemis",
            "sunshineApp": "Korri Stream",
        })
    );

    std::fs::write(
        root.path().join("config.yaml"),
        "host:\n  plugin:\n    '@korri:moonlight': false\n",
    )
    .expect("user-disabled config");
    let response = app
        .oneshot(request())
        .await
        .expect("disabled Moonlight RPC response");
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("disabled Moonlight RPC body");
    let body: serde_json::Value = serde_json::from_slice(&body).expect("typed response");
    assert_eq!(body["outcome"]["_tag"], "Unavailable");
    assert_eq!(body["outcome"]["payload"]["code"], "MoonlightUnavailable");
}

#[test]
fn layered_disable_removes_controls_without_reassigning_reserved_identity() {
    let disabled = registry(&["@korri:retroarch"]);
    assert!(disabled.owns_registered_session_control_id("@korri:moonlight/disconnect"));
    assert!(!disabled
        .session_controls()
        .contains_key("@korri:moonlight/disconnect"));
    assert_eq!(
        resolve_session_controls(
            &disabled,
            &android_route(&[
                SessionControlExecutor::AndroidMoonlight,
                SessionControlExecutor::RetroarchControl,
            ]),
        )
        .iter()
        .map(|control| control.id.as_str())
        .collect::<Vec<_>>(),
        ["@korri:retroarch/open-menu"]
    );

    let enabled = registry(&["@korri:moonlight", "@korri:retroarch"]);
    assert!(enabled
        .session_controls()
        .contains_key("@korri:moonlight/disconnect"));
}
