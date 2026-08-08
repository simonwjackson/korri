use std::{collections::BTreeMap, ffi::OsString, path::PathBuf, process::ExitCode, time::Duration};

use korri_inputd::{
    actions::{
        commands_from_environment, set_parent_non_dumpable, ActionDispatcher, ActionIdentity,
        ActionLimits, ActionOutcome, ActionRoutes, DispatchMode,
    },
    dbus::DbusSignalSource,
    devices::EvdevProvider,
    health::{systemd::SystemdHealthPublisher, HealthPublisher, RuntimeHealth},
    korrid_client::{ExactStopOutcome, KorridClient},
    runtime::{Runtime, RuntimeAction, RECONCILE_INTERVAL},
};
use tokio::time::MissedTickBehavior;
use tracing_subscriber::EnvFilter;

const DBUS_RETRY_INTERVAL: Duration = RECONCILE_INTERVAL;
const HOLD_POLL_INTERVAL: Duration = Duration::from_millis(50);

#[tokio::main]
async fn main() -> ExitCode {
    if let Err(error) = set_parent_non_dumpable() {
        eprintln!("korri-inputd could not disable process dumps: {error}");
        return ExitCode::FAILURE;
    }
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    if let Err(error) = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .try_init()
    {
        eprintln!("korri-inputd could not initialize structured logging: {error}");
        return ExitCode::FAILURE;
    }

    let (actions, routes, korrid) = match configured_services() {
        Ok(configured) => configured,
        Err(error) => {
            tracing::error!(
                event = "inputd_configuration_rejected",
                error,
                "configuration is unsafe"
            );
            return ExitCode::FAILURE;
        }
    };

    let mut health = SystemdHealthPublisher::default();
    if let Err(error) = initialize_health(&mut health) {
        tracing::error!(
            event = "inputd_initial_ready_failed",
            error = %error,
            "systemd did not accept initial readiness"
        );
        return ExitCode::FAILURE;
    }
    run(actions, routes, korrid, &mut health).await;
    ExitCode::SUCCESS
}

fn initialize_health(health: &mut impl HealthPublisher) -> std::io::Result<()> {
    health.initialized(RuntimeHealth::Recovering)
}

async fn run(
    actions: ActionDispatcher,
    routes: ActionRoutes,
    korrid: KorridClient,
    health: &mut impl HealthPublisher,
) {
    let mut runtime = Runtime::with_action_routes(routes);
    let mut provider = EvdevProvider::default();
    let mut dbus = None;
    let mut dbus_failure_logged = false;
    let mut reconcile = tokio::time::interval(RECONCILE_INTERVAL);
    reconcile.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let mut hold_poll = tokio::time::interval(HOLD_POLL_INTERVAL);
    hold_poll.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        let has_evdev = runtime.has_open_target();
        let has_dbus = dbus.is_some();
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                tracing::info!(event = "inputd_shutdown", "shutdown requested");
                return;
            }
            _ = hold_poll.tick() => {
                dispatch_actions(runtime.advance_actions(), &actions, &korrid);
            }
            _ = reconcile.tick() => {
                if dbus.is_none() {
                    match DbusSignalSource::system().await {
                        Ok(source) => dbus = Some(source),
                        Err(error) => {
                            if !dbus_failure_logged {
                                tracing::warn!(
                                    event = "inputd_dbus_connect_failed",
                                    retry_ms = DBUS_RETRY_INTERVAL.as_millis() as u64,
                                    error = %error,
                                    "system bus is unavailable"
                                );
                            }
                        }
                    }
                }
                let dbus_available = refresh_owner(&mut runtime, &mut dbus).await;
                if dbus_available && dbus_failure_logged {
                    tracing::info!(
                        event = "inputd_dbus_recovered",
                        "system bus connection recovered"
                    );
                }
                dbus_failure_logged = !dbus_available;
                runtime.reconcile(&mut provider);
            }
            message = next_dbus_message(&mut dbus), if has_dbus => {
                match message {
                    Ok(Some(message)) => {
                        if refresh_owner(&mut runtime, &mut dbus).await {
                            dbus_failure_logged = false;
                            dispatch_actions(runtime.handle_dbus_message(&message), &actions, &korrid);
                        } else {
                            dbus_failure_logged = true;
                        }
                    }
                    Ok(None) => {
                        tracing::warn!(event = "inputd_dbus_stream_ended", "DBus signal stream ended");
                        dbus = None;
                        dbus_failure_logged = true;
                        runtime.set_dbus_owner(None);
                    }
                    Err(error) => {
                        tracing::warn!(
                            event = "inputd_dbus_stream_failed",
                            error = %error,
                            "DBus signal stream failed"
                        );
                        dbus = None;
                        dbus_failure_logged = true;
                        runtime.set_dbus_owner(None);
                    }
                }
            }
            result = runtime.next_evdev_actions(), if has_evdev => {
                match result {
                    Ok(Some(matched)) => dispatch_actions(matched, &actions, &korrid),
                    Ok(None) => tracing::warn!(
                        event = "inputd_evdev_stream_ended",
                        "normalized target event stream ended"
                    ),
                    Err(error) => tracing::warn!(
                        event = "inputd_evdev_stream_failed",
                        error_kind = ?error.kind(),
                        "normalized target event stream failed"
                    ),
                }
            }
        }
        if let Err(error) = health.publish(RuntimeHealth::from(runtime.state())) {
            tracing::warn!(
                event = "inputd_health_publish_failed",
                error = %error,
                "systemd health publication failed"
            );
        }
    }
}

async fn next_dbus_message(
    source: &mut Option<DbusSignalSource>,
) -> zbus::Result<Option<zbus::Message>> {
    source
        .as_mut()
        .expect("DBus branch is enabled only while connected")
        .next_message()
        .await
}

async fn refresh_owner(runtime: &mut Runtime, source: &mut Option<DbusSignalSource>) -> bool {
    let Some(connected) = source.as_ref() else {
        runtime.set_dbus_owner(None);
        return false;
    };
    match connected.current_owner().await {
        Ok(owner) => {
            runtime.set_dbus_owner(owner.as_deref());
            true
        }
        Err(error) => {
            tracing::warn!(
                event = "inputd_dbus_owner_query_failed",
                error = %error,
                "could not authenticate the InputPlumber DBus owner"
            );
            *source = None;
            runtime.set_dbus_owner(None);
            false
        }
    }
}

fn dispatch_actions(
    matched: Vec<RuntimeAction>,
    dispatcher: &ActionDispatcher,
    korrid: &KorridClient,
) {
    for action in matched {
        tracing::info!(
            event = "inputd_policy_match",
            action = %action.id,
            dispatch_mode = ?action.dispatch_mode,
            "input policy matched"
        );
        if action.dispatch_mode == DispatchMode::ExactStop {
            let client = korrid.clone();
            tokio::spawn(async move {
                match client.stop_active_exact().await {
                    Ok(outcome) => log_stop_outcome(outcome),
                    Err(error) => tracing::warn!(
                        event = "inputd_exact_stop_failed",
                        error = %error,
                        "exact stop failed without fallback"
                    ),
                }
            });
            continue;
        }

        let dispatcher = dispatcher.clone();
        tokio::spawn(async move {
            let action_id = action.id;
            match dispatcher.dispatch(action_id).await {
                ActionOutcome::Unconfigured => tracing::warn!(
                    event = "inputd_action_unconfigured",
                    action = %action_id,
                    "input action has no configured command"
                ),
                ActionOutcome::ConcurrencyLimited => tracing::warn!(
                    event = "inputd_action_concurrency_limited",
                    action = %action_id,
                    "input action was rejected at the concurrency limit"
                ),
                ActionOutcome::Completed(output) => tracing::info!(
                    event = "inputd_action_completed",
                    action = %action_id,
                    stdout_bytes = output.stdout.len(),
                    stderr_bytes = output.stderr.len(),
                    stdout_truncated = output.stdout_truncated,
                    stderr_truncated = output.stderr_truncated,
                    "input action completed"
                ),
                ActionOutcome::Failed(output) => tracing::warn!(
                    event = "inputd_action_failed",
                    action = %action_id,
                    status = ?output.status,
                    stdout_bytes = output.stdout.len(),
                    stderr_bytes = output.stderr.len(),
                    "input action failed without retry"
                ),
                ActionOutcome::TimedOut(output) => tracing::warn!(
                    event = "inputd_action_timed_out",
                    action = %action_id,
                    stdout_bytes = output.stdout.len(),
                    stderr_bytes = output.stderr.len(),
                    "input action exceeded its runtime limit"
                ),
                ActionOutcome::SpawnFailed(error) => tracing::warn!(
                    event = "inputd_action_spawn_failed",
                    action = %action_id,
                    error,
                    "input action child was rejected"
                ),
                ActionOutcome::ContainmentFailed(error) => tracing::error!(
                    event = "inputd_action_containment_failed",
                    action = %action_id,
                    error,
                    "input action containment failed closed"
                ),
            }
        });
    }
}

fn log_stop_outcome(outcome: ExactStopOutcome) {
    let outcome = match outcome {
        ExactStopOutcome::NoActive => "no-active",
        ExactStopOutcome::StaleIdentity => "stale",
        ExactStopOutcome::AlreadyStopping => "already-stopping",
        ExactStopOutcome::Completed => "completed",
        ExactStopOutcome::RecoveryBlocked => "recovery-blocked",
    };
    tracing::info!(
        event = "inputd_exact_stop_outcome",
        outcome,
        "exact stop request completed"
    );
}

fn configured_services() -> Result<(ActionDispatcher, ActionRoutes, KorridClient), String> {
    let environment = std::env::vars_os().collect::<BTreeMap<OsString, OsString>>();
    let (commands, routes) =
        commands_from_environment(&environment).map_err(|error| error.to_string())?;
    let identity = ActionIdentity {
        uid: required_unprivileged_id("KORRI_INPUTD_ACTION_UID", &environment)?,
        gid: required_unprivileged_id("KORRI_INPUTD_ACTION_GID", &environment)?,
        control_gid: required_unprivileged_id("KORRI_INPUTD_CONTROL_GID", &environment)?,
    };
    if unsafe { libc::getegid() } != identity.control_gid {
        return Err("inputd primary GID does not match KORRI_INPUTD_CONTROL_GID".into());
    }
    let dispatcher = ActionDispatcher::new(commands, identity, ActionLimits::default())
        .map_err(|error| error.to_string())?;
    let socket = required_absolute_path("KORRI_INPUTD_CONTROL_SOCKET", &environment)?;
    Ok((dispatcher, routes, KorridClient::new(socket)))
}

fn required_unprivileged_id(
    name: &str,
    environment: &BTreeMap<OsString, OsString>,
) -> Result<u32, String> {
    let value = environment
        .get(std::ffi::OsStr::new(name))
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("{name} must be configured"))?;
    let id = value
        .parse::<u32>()
        .map_err(|_| format!("{name} must be a numeric ID"))?;
    if id == 0 {
        return Err(format!("{name} must identify an unprivileged account"));
    }
    Ok(id)
}

fn required_absolute_path(
    name: &str,
    environment: &BTreeMap<OsString, OsString>,
) -> Result<PathBuf, String> {
    let path = environment
        .get(std::ffi::OsStr::new(name))
        .map(PathBuf::from)
        .ok_or_else(|| format!("{name} must be configured"))?;
    if !path.is_absolute() {
        return Err(format!("{name} must be absolute"));
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct ConfigurableHealthPublisher {
        initialization: std::io::Result<()>,
    }

    impl HealthPublisher for ConfigurableHealthPublisher {
        fn initialized(&mut self, _health: RuntimeHealth) -> std::io::Result<()> {
            std::mem::replace(&mut self.initialization, Ok(()))
        }

        fn publish(&mut self, _health: RuntimeHealth) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn initial_ready_publication_failure_is_fatal_to_startup() {
        let mut health = ConfigurableHealthPublisher {
            initialization: Err(std::io::Error::other("notify socket rejected READY")),
        };

        let error = initialize_health(&mut health).unwrap_err();

        assert_eq!(error.to_string(), "notify socket rejected READY");
    }
}
