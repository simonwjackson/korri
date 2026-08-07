use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct HoldConfig {
    pub tap_ms: u64,
    pub hold_ms: u64,
}

impl Default for HoldConfig {
    fn default() -> Self {
        Self {
            tap_ms: 250,
            hold_ms: 2_000,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HoldPhase {
    Press,
    Progress,
    Fired,
    Tap,
    Cancel,
}

#[derive(Clone, Debug, PartialEq)]
pub struct HoldUpdate {
    pub id: String,
    pub phase: HoldPhase,
    pub progress: f64,
    pub elapsed_ms: u64,
}

#[derive(Clone, Copy)]
struct HoldState {
    started_at_ms: u64,
    fired: bool,
}

pub struct HoldPolicy {
    config: HoldConfig,
    holds: BTreeMap<String, HoldState>,
}

impl HoldPolicy {
    pub fn new(config: HoldConfig) -> Self {
        Self {
            config: HoldConfig {
                tap_ms: config.tap_ms.min(config.hold_ms),
                hold_ms: config.hold_ms,
            },
            holds: BTreeMap::new(),
        }
    }

    pub fn engage(&mut self, id: impl Into<String>, now_ms: u64) -> Vec<HoldUpdate> {
        let id = id.into();
        if self.holds.contains_key(&id) {
            return Vec::new();
        }

        let fired = self.config.hold_ms == 0;
        self.holds.insert(
            id.clone(),
            HoldState {
                started_at_ms: now_ms,
                fired,
            },
        );

        let mut updates = vec![HoldUpdate {
            id: id.clone(),
            phase: HoldPhase::Press,
            progress: 0.0,
            elapsed_ms: 0,
        }];
        if fired {
            updates.push(HoldUpdate {
                id,
                phase: HoldPhase::Fired,
                progress: 1.0,
                elapsed_ms: 0,
            });
        }
        updates
    }

    pub fn advance(&mut self, now_ms: u64) -> Vec<HoldUpdate> {
        let config = self.config;
        self.holds
            .iter_mut()
            .filter_map(|(id, state)| {
                if state.fired {
                    return None;
                }
                let elapsed_ms = now_ms.saturating_sub(state.started_at_ms);
                if elapsed_ms >= config.hold_ms {
                    state.fired = true;
                    return Some(HoldUpdate {
                        id: id.clone(),
                        phase: HoldPhase::Fired,
                        progress: 1.0,
                        elapsed_ms,
                    });
                }
                if elapsed_ms < config.tap_ms {
                    return None;
                }
                Some(HoldUpdate {
                    id: id.clone(),
                    phase: HoldPhase::Progress,
                    progress: progress(config, elapsed_ms),
                    elapsed_ms,
                })
            })
            .collect()
    }

    pub fn release(&mut self, id: &str, now_ms: u64) -> Vec<HoldUpdate> {
        let Some(state) = self.holds.remove(id) else {
            return Vec::new();
        };
        if state.fired {
            return Vec::new();
        }

        let elapsed_ms = now_ms.saturating_sub(state.started_at_ms);
        if elapsed_ms >= self.config.hold_ms {
            return vec![HoldUpdate {
                id: id.to_owned(),
                phase: HoldPhase::Fired,
                progress: 1.0,
                elapsed_ms,
            }];
        }
        if elapsed_ms < self.config.tap_ms {
            return vec![HoldUpdate {
                id: id.to_owned(),
                phase: HoldPhase::Tap,
                progress: 0.0,
                elapsed_ms,
            }];
        }
        vec![HoldUpdate {
            id: id.to_owned(),
            phase: HoldPhase::Cancel,
            progress: progress(self.config, elapsed_ms),
            elapsed_ms,
        }]
    }

    pub fn clear(&mut self, id: &str) -> bool {
        self.holds.remove(id).is_some()
    }

    pub fn is_holding(&self, id: Option<&str>) -> bool {
        match id {
            Some(id) => self.holds.contains_key(id),
            None => !self.holds.is_empty(),
        }
    }

    pub fn reset(&mut self) {
        self.holds.clear();
    }
}

fn progress(config: HoldConfig, elapsed_ms: u64) -> f64 {
    let span = config.hold_ms.saturating_sub(config.tap_ms).max(1);
    let elapsed_after_tap = elapsed_ms.saturating_sub(config.tap_ms);
    (elapsed_after_tap as f64 / span as f64).clamp(0.0, 1.0)
}
