use std::{io, path::PathBuf, time::Duration};

use futures_util::StreamExt;
use korri_input_core::{
    controls::{Control, ControlEvent, ControlTransition, DpadAxis},
    shortcuts::{ShortcutDefinition, ShortcutPolicy, TapDefinition},
};

use crate::{
    dbus::{authenticated_message, DbusAuthenticator, SemanticInput, Signal},
    devices::{
        resolve_target, validate_opened_descriptor, DeviceDescriptor, OpenedTarget, TargetIdentity,
        TargetProvider, TargetResolution,
    },
};

pub const RECONCILE_INTERVAL: Duration = Duration::from_secs(1);
pub const MAX_LOG_FIELD_BYTES: usize = 160;
const EVDEV_SOURCE: &str = "evdev:inputplumber-xb360";
const DBUS_SOURCE: &str = "dbus:inputplumber";

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RuntimeState {
    Missing { raw_gamepads: usize },
    Ambiguous { targets: Vec<PathBuf> },
    Recovering { reason: RecoveryReason },
    Ready { target: ReadyTarget },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReadyTarget {
    pub identity: TargetIdentity,
    pub path: PathBuf,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecoveryReason {
    ProviderUnavailable,
    DiscoveryFailed,
    RequiredTargetUnreadable,
    DescriptorChangedAfterOpen,
    EventStreamLost,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeAction {
    pub id: String,
    pub destructive: bool,
}

struct Policies {
    non_destructive: ShortcutPolicy,
    destructive: ShortcutPolicy,
}

impl Policies {
    fn new() -> Self {
        Self {
            non_destructive: ShortcutPolicy::new(
                vec![
                    ShortcutDefinition::non_destructive(
                        "workspace-prev",
                        [Control::Home, Control::L1],
                        false,
                    ),
                    ShortcutDefinition::non_destructive(
                        "workspace-next",
                        [Control::Home, Control::R1],
                        false,
                    ),
                ],
                vec![TapDefinition::new("system-panel", Control::Home)],
            ),
            destructive: ShortcutPolicy::new(
                vec![ShortcutDefinition::destructive(
                    "kill-current-game",
                    [Control::L1, Control::R1, Control::Start, Control::Select],
                )],
                vec![],
            ),
        }
    }

    fn reset(&mut self) {
        self.non_destructive.reset();
        self.destructive.reset();
    }

    fn clear_evdev(&mut self) {
        self.non_destructive.clear_source(EVDEV_SOURCE);
    }

    fn handle(&mut self, source: InputSource, input: SemanticInput) -> Vec<RuntimeAction> {
        let source_name = match source {
            InputSource::Evdev => EVDEV_SOURCE,
            InputSource::AuthenticatedDbus => DBUS_SOURCE,
        };
        let mut actions = handle_policy(&mut self.non_destructive, source_name, input)
            .into_iter()
            .map(|id| RuntimeAction {
                id,
                destructive: false,
            })
            .collect::<Vec<_>>();
        if source == InputSource::AuthenticatedDbus {
            actions.extend(
                handle_policy(&mut self.destructive, source_name, input)
                    .into_iter()
                    .map(|id| RuntimeAction {
                        id,
                        destructive: true,
                    }),
            );
        }
        actions
    }
}

fn handle_policy(policy: &mut ShortcutPolicy, source: &str, input: SemanticInput) -> Vec<String> {
    let matches = match input {
        SemanticInput::Control(control, ControlTransition::Pressed) => {
            policy.handle(ControlEvent::pressed(source, control))
        }
        SemanticInput::Control(control, ControlTransition::Released) => {
            policy.handle(ControlEvent::released(source, control))
        }
        SemanticInput::Axis(axis, value) => policy.handle_dpad_axis(source, axis, value),
    };
    matches.into_iter().map(|matched| matched.id).collect()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum InputSource {
    Evdev,
    AuthenticatedDbus,
}

pub struct Runtime {
    state: RuntimeState,
    opened: Option<OpenedTarget>,
    policies: Policies,
    dbus: DbusAuthenticator,
}

impl Default for Runtime {
    fn default() -> Self {
        Self {
            state: RuntimeState::Recovering {
                reason: RecoveryReason::ProviderUnavailable,
            },
            opened: None,
            policies: Policies::new(),
            dbus: DbusAuthenticator::default(),
        }
    }
}

impl Runtime {
    pub fn state(&self) -> &RuntimeState {
        &self.state
    }

    pub fn dbus_owner(&self) -> Option<&str> {
        self.dbus.owner()
    }

    pub fn has_open_target(&self) -> bool {
        self.opened.is_some()
    }

    pub fn set_dbus_owner(&mut self, owner: Option<&str>) {
        if !self.dbus.set_owner(owner) {
            return;
        }
        self.clear_all();
        if self.dbus.owner().is_none() {
            self.transition(RuntimeState::Recovering {
                reason: RecoveryReason::ProviderUnavailable,
            });
        } else if let Some(opened) = &self.opened {
            self.transition(RuntimeState::Ready {
                target: ready_target(&opened.descriptor),
            });
        }
    }

    pub fn reconcile(&mut self, provider: &mut impl TargetProvider) {
        let devices = match provider.enumerate() {
            Ok(devices) => devices,
            Err(error) => {
                let state = RuntimeState::Recovering {
                    reason: RecoveryReason::DiscoveryFailed,
                };
                if self.state != state {
                    tracing::warn!(
                        event = "inputd_reconcile_failed",
                        error_kind = ?error.kind(),
                        "bounded device reconciliation failed"
                    );
                }
                self.close_target();
                self.transition(state);
                return;
            }
        };

        match resolve_target(&devices) {
            TargetResolution::Missing { raw_gamepads } => {
                self.close_target();
                if self.dbus.owner().is_some() {
                    self.transition(RuntimeState::Missing { raw_gamepads });
                } else {
                    self.transition(RuntimeState::Recovering {
                        reason: RecoveryReason::ProviderUnavailable,
                    });
                }
            }
            TargetResolution::Ambiguous { targets } => {
                self.close_target();
                let paths = targets
                    .into_iter()
                    .map(|target| target.path)
                    .collect::<Vec<_>>();
                self.transition(RuntimeState::Ambiguous { targets: paths });
            }
            TargetResolution::Found(expected) => {
                if self.opened.as_ref().is_some_and(|opened| {
                    opened.descriptor.path == expected.path
                        && opened.descriptor.stable_identity() == expected.stable_identity()
                        && opened.descriptor.device_number == expected.device_number
                }) {
                    if self.dbus.owner().is_some()
                        && !matches!(self.state, RuntimeState::Ready { .. })
                    {
                        self.transition(RuntimeState::Ready {
                            target: ready_target(&expected),
                        });
                    }
                    return;
                }

                self.close_target();
                let opened = match provider.open(&expected) {
                    Ok(opened) => opened,
                    Err(error) => {
                        let state = RuntimeState::Recovering {
                            reason: RecoveryReason::RequiredTargetUnreadable,
                        };
                        if self.state != state {
                            tracing::warn!(
                                event = "inputd_required_target_unreadable",
                                target = %bounded_path(&expected.path),
                                error_kind = ?error.kind(),
                                "required normalized target could not be opened"
                            );
                        }
                        self.transition(state);
                        return;
                    }
                };
                if validate_opened_descriptor(&expected, &opened.descriptor).is_err() {
                    let state = RuntimeState::Recovering {
                        reason: RecoveryReason::DescriptorChangedAfterOpen,
                    };
                    if self.state != state {
                        tracing::warn!(
                            event = "inputd_target_provenance_rejected",
                            target = %bounded_path(&expected.path),
                            "opened descriptor did not match enumerated target"
                        );
                    }
                    self.transition(state);
                    return;
                }
                let ready = ready_target(&opened.descriptor);
                self.opened = Some(opened);
                if self.dbus.owner().is_some() {
                    self.transition(RuntimeState::Ready { target: ready });
                } else {
                    self.transition(RuntimeState::Recovering {
                        reason: RecoveryReason::ProviderUnavailable,
                    });
                }
            }
        }
    }

    pub fn handle_dbus_signal(&mut self, signal: &Signal<'_>) -> Vec<RuntimeAction> {
        if !matches!(self.state, RuntimeState::Ready { .. }) {
            return Vec::new();
        }
        self.dbus
            .authenticate(signal)
            .map(|input| self.policies.handle(InputSource::AuthenticatedDbus, input))
            .unwrap_or_default()
    }

    pub fn handle_dbus_message(&mut self, message: &zbus::Message) -> Vec<RuntimeAction> {
        if !matches!(self.state, RuntimeState::Ready { .. }) {
            return Vec::new();
        }
        authenticated_message(&self.dbus, message)
            .map(|input| self.policies.handle(InputSource::AuthenticatedDbus, input))
            .unwrap_or_default()
    }

    pub fn handle_evdev(&mut self, event_type: u16, code: u16, value: i32) -> Vec<RuntimeAction> {
        if !matches!(self.state, RuntimeState::Ready { .. }) {
            return Vec::new();
        }
        map_evdev(event_type, code, value)
            .map(|input| self.policies.handle(InputSource::Evdev, input))
            .unwrap_or_default()
    }

    pub async fn next_evdev_actions(&mut self) -> io::Result<Option<Vec<RuntimeAction>>> {
        let event = match self.opened.as_mut() {
            Some(opened) => opened.events.next().await,
            None => return Ok(None),
        };
        match event {
            Some(Ok(event)) => Ok(Some(self.handle_evdev(
                event.event_type().0,
                event.code(),
                event.value(),
            ))),
            Some(Err(error)) => {
                self.event_stream_lost();
                Err(error)
            }
            None => {
                self.event_stream_lost();
                Ok(None)
            }
        }
    }

    pub fn event_stream_lost(&mut self) {
        self.close_target();
        self.transition(RuntimeState::Recovering {
            reason: RecoveryReason::EventStreamLost,
        });
    }

    fn close_target(&mut self) {
        if self.opened.take().is_some() {
            self.policies.clear_evdev();
        }
        self.policies.reset();
    }

    fn clear_all(&mut self) {
        self.policies.reset();
    }

    fn transition(&mut self, state: RuntimeState) {
        if self.state == state {
            return;
        }
        match &state {
            RuntimeState::Missing { raw_gamepads } => tracing::warn!(
                event = "inputd_state",
                state = "missing",
                raw_gamepads,
                "normalized target is missing"
            ),
            RuntimeState::Ambiguous { targets } => tracing::warn!(
                event = "inputd_state",
                state = "ambiguous",
                target_count = targets.len(),
                "multiple normalized targets were found"
            ),
            RuntimeState::Recovering { reason } => tracing::warn!(
                event = "inputd_state",
                state = "recovering",
                reason = ?reason,
                "input runtime is recovering"
            ),
            RuntimeState::Ready { target } => tracing::info!(
                event = "inputd_state",
                state = "ready",
                target = %bounded_path(&target.path),
                "normalized input runtime is ready"
            ),
        }
        self.state = state;
    }
}

fn ready_target(descriptor: &DeviceDescriptor) -> ReadyTarget {
    ReadyTarget {
        identity: descriptor.stable_identity(),
        path: descriptor.path.clone(),
    }
}

fn bounded_path(path: &std::path::Path) -> String {
    let value = path.to_string_lossy();
    value.chars().take(MAX_LOG_FIELD_BYTES).collect()
}

pub fn map_evdev(event_type: u16, code: u16, value: i32) -> Option<SemanticInput> {
    const EV_KEY: u16 = 1;
    const EV_ABS: u16 = 3;
    const ABS_HAT0X: u16 = 16;
    const ABS_HAT0Y: u16 = 17;
    if event_type == EV_ABS {
        return match code {
            ABS_HAT0X => Some(SemanticInput::Axis(DpadAxis::Horizontal, value)),
            ABS_HAT0Y => Some(SemanticInput::Axis(DpadAxis::Vertical, value)),
            _ => None,
        };
    }
    if event_type != EV_KEY || !matches!(value, 0..=2) {
        return None;
    }
    if value == 2 {
        return None;
    }
    let control = match code {
        0x13c => Control::Home,
        0x136 => Control::L1,
        0x137 => Control::R1,
        0x13b => Control::Start,
        0x13a => Control::Select,
        0x13d => Control::L3,
        0x13e => Control::R3,
        0x116 => Control::Back,
        0x133 => Control::X,
        _ => return None,
    };
    Some(SemanticInput::Control(
        control,
        if value == 0 {
            ControlTransition::Released
        } else {
            ControlTransition::Pressed
        },
    ))
}
