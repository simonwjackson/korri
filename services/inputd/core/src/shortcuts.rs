use std::collections::{BTreeMap, BTreeSet};

use crate::controls::{Control, ControlEvent, ControlTransition, ControlValue, DpadAxis};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SourceRule {
    Any,
    Same,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ShortcutDefinition {
    id: String,
    required_controls: Vec<Control>,
    exact: bool,
    source_rule: SourceRule,
}

impl ShortcutDefinition {
    pub fn non_destructive(
        id: impl Into<String>,
        required_controls: impl IntoIterator<Item = Control>,
        exact: bool,
    ) -> Self {
        Self::new(id, required_controls, exact, SourceRule::Any)
    }

    pub fn destructive(
        id: impl Into<String>,
        required_controls: impl IntoIterator<Item = Control>,
    ) -> Self {
        Self::new(id, required_controls, true, SourceRule::Same)
    }

    fn new(
        id: impl Into<String>,
        required_controls: impl IntoIterator<Item = Control>,
        exact: bool,
        source_rule: SourceRule,
    ) -> Self {
        let required_controls = required_controls
            .into_iter()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        Self {
            id: id.into(),
            required_controls,
            exact,
            source_rule,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TapDefinition {
    id: String,
    control: Control,
}

impl TapDefinition {
    pub fn new(id: impl Into<String>, control: Control) -> Self {
        Self {
            id: id.into(),
            control,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ShortcutMatch {
    pub id: String,
}

#[derive(Default)]
struct SourceState {
    pressed: BTreeSet<Control>,
    horizontal: Option<Control>,
    vertical: Option<Control>,
}

pub struct ShortcutPolicy {
    shortcuts: Vec<ShortcutDefinition>,
    taps: Vec<TapDefinition>,
    sources: BTreeMap<String, SourceState>,
    fired_ids: BTreeSet<String>,
    consumed_taps: BTreeSet<Control>,
    destructive_controls: BTreeSet<Control>,
    destructive_disarmed_controls: BTreeSet<Control>,
}

impl ShortcutPolicy {
    pub fn new(shortcuts: Vec<ShortcutDefinition>, taps: Vec<TapDefinition>) -> Self {
        let destructive_controls = shortcuts
            .iter()
            .filter(|shortcut| shortcut.source_rule == SourceRule::Same)
            .flat_map(|shortcut| shortcut.required_controls.iter().copied())
            .collect::<BTreeSet<_>>();
        Self {
            shortcuts,
            taps,
            sources: BTreeMap::new(),
            fired_ids: BTreeSet::new(),
            consumed_taps: BTreeSet::new(),
            destructive_disarmed_controls: destructive_controls.clone(),
            destructive_controls,
        }
    }

    pub fn handle(&mut self, event: ControlEvent) -> Vec<ShortcutMatch> {
        match event.transition {
            ControlTransition::Pressed => self.press(event.source, event.control),
            ControlTransition::Released => {
                self.destructive_disarmed_controls.remove(&event.control);
                self.release(&event.source, event.control)
            }
        }
    }

    pub fn handle_value(
        &mut self,
        source: impl Into<String>,
        control: &str,
        value: i32,
    ) -> Vec<ShortcutMatch> {
        let Ok(control) = control.parse() else {
            return Vec::new();
        };
        let Some(value) = ControlValue::from_i32(value) else {
            return Vec::new();
        };
        match value {
            ControlValue::Released => self.handle(ControlEvent::released(source, control)),
            ControlValue::Pressed => self.handle(ControlEvent::pressed(source, control)),
            ControlValue::Repeat => Vec::new(),
        }
    }

    pub fn handle_dpad_axis(
        &mut self,
        source: impl Into<String>,
        axis: DpadAxis,
        value: i32,
    ) -> Vec<ShortcutMatch> {
        let source = source.into();
        let next = axis.control_for(value);
        let previous = {
            let state = self.sources.entry(source.clone()).or_default();
            let current = match axis {
                DpadAxis::Horizontal => &mut state.horizontal,
                DpadAxis::Vertical => &mut state.vertical,
            };
            if *current == next {
                return Vec::new();
            }
            std::mem::replace(current, next)
        };

        let mut matches = Vec::new();
        if let Some(previous) = previous {
            matches.extend(self.release(&source, previous));
        }
        if let Some(next) = next {
            matches.extend(self.press(source, next));
        }
        matches
    }

    pub fn clear_source(&mut self, source: &str) {
        self.sources.remove(source);
        self.remove_empty_sources();
        self.rearm_inactive_actions();
        self.consumed_taps.retain(|control| {
            self.sources
                .values()
                .any(|state| state.pressed.contains(control))
        });
        self.disarm_destructive_matching();
    }

    pub fn is_pressed(&self, control: Control) -> bool {
        self.sources
            .values()
            .any(|state| state.pressed.contains(&control))
    }

    pub fn reset(&mut self) {
        self.sources.clear();
        self.fired_ids.clear();
        self.consumed_taps.clear();
        self.disarm_destructive_matching();
    }

    fn press(&mut self, source: String, control: Control) -> Vec<ShortcutMatch> {
        if !self
            .sources
            .entry(source.clone())
            .or_default()
            .pressed
            .insert(control)
        {
            return Vec::new();
        }

        let mut matches = Vec::new();
        for index in 0..self.shortcuts.len() {
            let shortcut = &self.shortcuts[index];
            if !shortcut.required_controls.contains(&control)
                || self.fired_ids.contains(&shortcut.id)
                || !self.definition_matches(shortcut, &source)
            {
                continue;
            }

            let id = shortcut.id.clone();
            let consumed = shortcut.required_controls.clone();
            self.fired_ids.insert(id.clone());
            self.consumed_taps.extend(consumed);
            matches.push(ShortcutMatch { id });
        }
        matches
    }

    fn release(&mut self, source: &str, control: Control) -> Vec<ShortcutMatch> {
        let Some(state) = self.sources.get_mut(source) else {
            return Vec::new();
        };
        if !state.pressed.remove(&control) {
            return Vec::new();
        }

        self.remove_empty_sources();
        self.rearm_inactive_actions();

        if self.is_pressed(control) {
            return Vec::new();
        }

        let consumed = self.consumed_taps.remove(&control);
        if consumed {
            return Vec::new();
        }

        self.taps
            .iter()
            .filter(|tap| tap.control == control)
            .map(|tap| ShortcutMatch { id: tap.id.clone() })
            .collect()
    }

    fn definition_matches(&self, shortcut: &ShortcutDefinition, source: &str) -> bool {
        match shortcut.source_rule {
            SourceRule::Any => {
                let active = self.active_controls();
                shortcut
                    .required_controls
                    .iter()
                    .all(|control| active.contains(control))
                    && (!shortcut.exact || active.len() == shortcut.required_controls.len())
            }
            SourceRule::Same => {
                self.destructive_disarmed_controls.is_empty()
                    && self.sources.get(source).is_some_and(|state| {
                        shortcut
                            .required_controls
                            .iter()
                            .all(|control| state.pressed.contains(control))
                            && (!shortcut.exact
                                || state.pressed.len() == shortcut.required_controls.len())
                    })
            }
        }
    }

    fn definition_assembled(&self, shortcut: &ShortcutDefinition) -> bool {
        match shortcut.source_rule {
            SourceRule::Any => shortcut
                .required_controls
                .iter()
                .all(|control| self.is_pressed(*control)),
            SourceRule::Same => self.sources.values().any(|state| {
                shortcut
                    .required_controls
                    .iter()
                    .all(|control| state.pressed.contains(control))
            }),
        }
    }

    fn active_controls(&self) -> BTreeSet<Control> {
        self.sources
            .values()
            .flat_map(|state| state.pressed.iter().copied())
            .collect()
    }

    fn rearm_inactive_actions(&mut self) {
        let still_active = self
            .shortcuts
            .iter()
            .filter(|shortcut| self.definition_assembled(shortcut))
            .map(|shortcut| shortcut.id.clone())
            .collect::<BTreeSet<_>>();
        self.fired_ids.retain(|id| still_active.contains(id));
    }

    fn remove_empty_sources(&mut self) {
        self.sources.retain(|_, state| {
            !state.pressed.is_empty() || state.horizontal.is_some() || state.vertical.is_some()
        });
    }

    fn disarm_destructive_matching(&mut self) {
        self.destructive_disarmed_controls = self.destructive_controls.clone();
    }
}
