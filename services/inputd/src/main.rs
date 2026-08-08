use std::{process::ExitCode, time::Duration};

use korri_inputd::{
    dbus::DbusSignalSource,
    devices::EvdevProvider,
    runtime::{Runtime, RuntimeAction, RECONCILE_INTERVAL},
};
use tokio::time::MissedTickBehavior;
use tracing_subscriber::EnvFilter;

const DBUS_RETRY_INTERVAL: Duration = RECONCILE_INTERVAL;

#[tokio::main]
async fn main() -> ExitCode {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    if let Err(error) = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .try_init()
    {
        eprintln!("korri-inputd could not initialize structured logging: {error}");
        return ExitCode::FAILURE;
    }

    run().await;
    ExitCode::SUCCESS
}

async fn run() {
    let mut runtime = Runtime::default();
    let mut provider = EvdevProvider::default();
    let mut dbus = None;
    let mut dbus_failure_logged = false;
    let mut reconcile = tokio::time::interval(RECONCILE_INTERVAL);
    reconcile.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        let has_evdev = runtime.has_open_target();
        let has_dbus = dbus.is_some();
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                tracing::info!(event = "inputd_shutdown", "shutdown requested");
                return;
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
                            emit_actions(runtime.handle_dbus_message(&message));
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
                    Ok(Some(actions)) => emit_actions(actions),
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

fn emit_actions(actions: Vec<RuntimeAction>) {
    for action in actions {
        tracing::info!(
            event = "inputd_policy_match",
            action = action.id,
            destructive = action.destructive,
            "input policy matched"
        );
    }
}
