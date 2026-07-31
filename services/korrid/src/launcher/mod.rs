mod android_app;
mod retroarch;
mod types;

pub use retroarch::LaunchError;
pub use types::{AndroidComponent, FileProvisionMode, LaunchSpec, LocalGame, ProvisionedFile};

use std::path::Path;

/// Everything playable on this device, from every launcher it knows.
pub fn local_games() -> Vec<LocalGame> {
    let mut games = android_app::local_games();
    games.extend(retroarch::local_games());
    games
}

/// Build the launch instruction for a game, asking each launcher whether it
/// owns the id. Launchers that do not own it decline, so adding one never
/// requires the caller to learn about it.
pub fn launch_game(
    root: &Path,
    game_id: &str,
    provision_mode: FileProvisionMode,
) -> Result<LaunchSpec, LaunchError> {
    if let Some(spec) = android_app::launch_game(game_id) {
        return Ok(spec);
    }
    retroarch::launch_game(root, game_id, provision_mode)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn lists_games_from_every_launcher() {
        let ids: Vec<String> = local_games().into_iter().map(|game| game.id).collect();
        assert!(ids.contains(&"tmnt-shredders-revenge".to_string()));
        assert!(ids.contains(&"wl4".to_string()));
    }

    #[test]
    fn routes_a_game_to_the_launcher_that_owns_it() {
        let root = tempdir().unwrap();
        let spec = launch_game(
            root.path(),
            "tmnt-shredders-revenge",
            FileProvisionMode::Deferred,
        )
        .expect("android-app launcher should own this");
        assert_eq!(spec.launcher_id, "android-app");
    }

    #[test]
    fn still_reports_retroarch_failures_for_retroarch_games() {
        // A missing ROM must surface as RetroArch's own error, not as an
        // unknown-game error from falling through the launchers.
        let root = tempdir().unwrap();
        let error = launch_game(root.path(), "wl4", FileProvisionMode::Deferred)
            .expect_err("rom is absent");
        assert!(
            matches!(error, LaunchError::RomMissing(_)),
            "got: {error:?}"
        );
    }
}
