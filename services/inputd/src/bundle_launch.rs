use std::{
    env,
    ffi::OsString,
    os::unix::process::CommandExt,
    path::{Path, PathBuf},
    process::{Command, ExitCode},
};

use korri_inputd::bundle::{resolve_bundle, resolve_component, resolve_profile, Component};

const ACTIVE_BUNDLE_ENV: &str = "KORRI_BUNDLE_ACTIVE";
const DEFAULT_ACTIVE_BUNDLE: &str = "/nix/var/nix/gcroots/korri-bundle/active";
const STORE_ROOT: &str = "/nix/store";

fn main() -> ExitCode {
    match launch(env::args_os().collect()) {
        Ok(never) => never,
        Err(error) => {
            eprintln!("korri-bundle-launch: {error}");
            ExitCode::FAILURE
        }
    }
}

fn launch(arguments: Vec<OsString>) -> Result<ExitCode, String> {
    let component = arguments
        .get(1)
        .and_then(|value| value.to_str())
        .ok_or_else(|| "usage: korri-bundle-launch <component> [argument ...]".to_owned())
        .and_then(Component::parse)?;
    let selector = env::var_os(ACTIVE_BUNDLE_ENV)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_ACTIVE_BUNDLE));
    let store_root = Path::new(STORE_ROOT);
    let bundle = resolve_bundle(&selector, store_root)?;
    let executable = resolve_component(&selector, component, store_root)?;
    let mut command = Command::new(&executable);
    command.args(arguments.into_iter().skip(2));
    if component == Component::InputPlumber {
        command.env("XDG_DATA_DIRS", bundle.join("share"));
    }
    if component == Component::Inputd {
        command.env(
            "KORRI_INPUTD_PROFILE_PATH",
            resolve_profile(&selector, store_root)?,
        );
    }
    Err(command.exec().to_string())
}
