//! Games already installed on the device as ordinary Android apps.
//!
//! These need no ROM and no generated config — the app is the whole runtime.
//! What they share with RetroArch is the launch *path*: korrid decides what
//! should run and emits a signed instruction; the shell verifies it and starts
//! it inside Korri's own task, so leaving the game returns to Korri rather
//! than dumping the user on the home screen.
//!
//! Hardcoded while the capability model is unbuilt, exactly as the RetroArch
//! launcher is. Scanning installed packages belongs with library indexing.

use super::{AndroidComponent, LaunchSpec, LocalGame};
use std::collections::HashMap;

struct InstalledGame {
    id: &'static str,
    title: &'static str,
    system: &'static str,
    package_name: &'static str,
}

const GAMES: &[InstalledGame] = &[InstalledGame {
    id: "tmnt-shredders-revenge",
    title: "TMNT: Shredder's Revenge",
    system: "Android",
    package_name: "com.playdigious.tmnt",
}];

pub fn local_games() -> Vec<LocalGame> {
    GAMES
        .iter()
        .map(|game| LocalGame {
            id: game.id.into(),
            title: game.title.into(),
            system: game.system.into(),
        })
        .collect()
}

/// Build the launch instruction for an installed game, or `None` when this
/// launcher does not own that id — the caller then tries the next launcher.
pub fn launch_game(game_id: &str) -> Option<LaunchSpec> {
    let game = GAMES.iter().find(|game| game.id == game_id)?;

    Some(LaunchSpec {
        launcher_id: "android-app".into(),
        component: AndroidComponent {
            package_name: game.package_name.into(),
            // Intentionally unused for android-app: Android package updates can
            // rename the launcher Activity, so the shell resolves the current
            // launcher intent with PackageManager at the moment of launch.
            class_name: String::new(),
        },
        // Nothing to hand the app and nothing to provision: it owns its own
        // saves and settings.
        extras: HashMap::new(),
        directories: Vec::new(),
        files: Vec::new(),
        integrity: String::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_the_installed_game() {
        let games = local_games();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].id, "tmnt-shredders-revenge");
        assert_eq!(games[0].title, "TMNT: Shredder's Revenge");
    }

    #[test]
    fn builds_a_launch_instruction_for_a_game_it_owns() {
        let spec = launch_game("tmnt-shredders-revenge").expect("should own this id");
        assert_eq!(spec.launcher_id, "android-app");
        assert_eq!(spec.component.package_name, "com.playdigious.tmnt");
        assert!(spec.component.class_name.is_empty());
    }

    #[test]
    fn provisions_nothing_because_the_app_owns_its_own_files() {
        let spec = launch_game("tmnt-shredders-revenge").expect("should own this id");
        assert!(spec.extras.is_empty());
        assert!(spec.directories.is_empty());
        assert!(spec.files.is_empty());
    }

    #[test]
    fn declines_ids_owned_by_another_launcher() {
        // wl4 belongs to RetroArch; declining lets the caller fall through.
        assert!(launch_game("wl4").is_none());
        assert!(launch_game("nonsense").is_none());
    }
}
