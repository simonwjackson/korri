use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::Path,
};

use super::systemd_unit::validate_launch_id;

pub(super) const IDENTITY_FILE: &str = "launch-id";
pub(super) const TEMP_IDENTITY_PREFIX: &str = ".launch-id-";

pub(super) fn read_identity(root: &Path) -> Result<Option<String>, String> {
    if !root.exists() {
        return Ok(None);
    }
    let metadata = fs::symlink_metadata(root).map_err(|error| error.to_string())?;
    if !metadata.is_dir() || metadata.permissions().mode() & 0o077 != 0 {
        return Err("host recovery state directory is not private".into());
    }
    let entries: Vec<_> = fs::read_dir(root)
        .map_err(|error| error.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|error| error.to_string())?;
    if entries.is_empty() {
        return Ok(None);
    }
    if entries.len() != 1 || entries[0].file_name() != IDENTITY_FILE {
        return Err("host recovery state is ambiguous".into());
    }
    let path = entries[0].path();
    let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.permissions().mode() & 0o077 != 0 {
        return Err("host recovery identity is not a private regular file".into());
    }
    let value = fs::read_to_string(path).map_err(|error| error.to_string())?;
    validate_launch_id(&value).map_err(|error| error.message)?;
    Ok(Some(value))
}

pub(super) fn persist_identity(root: &Path, launch_id: &str) -> Result<(), String> {
    validate_launch_id(launch_id).map_err(|error| error.message)?;
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    fs::set_permissions(root, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;
    if fs::read_dir(root)
        .map_err(|error| error.to_string())?
        .next()
        .is_some()
    {
        return Err("host recovery state is not empty".into());
    }
    let temporary = root.join(format!(
        "{TEMP_IDENTITY_PREFIX}{}",
        crate::generate_launch_id()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&temporary)
        .map_err(|error| error.to_string())?;
    file.write_all(launch_id.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|error| error.to_string())?;
    fs::rename(&temporary, root.join(IDENTITY_FILE)).map_err(|error| error.to_string())?;
    File::open(root)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())
}

pub(super) fn clear_crash_temporary_identity(root: &Path) -> Result<bool, String> {
    if !root.exists() {
        return Ok(false);
    }
    let metadata = fs::symlink_metadata(root).map_err(|error| error.to_string())?;
    if !metadata.is_dir() || metadata.permissions().mode() & 0o077 != 0 {
        return Ok(false);
    }
    let entries: Vec<_> = fs::read_dir(root)
        .map_err(|error| error.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|error| error.to_string())?;
    if entries.is_empty()
        || entries.iter().any(|entry| {
            !entry
                .file_name()
                .to_string_lossy()
                .starts_with(TEMP_IDENTITY_PREFIX)
        })
    {
        return Ok(false);
    }
    if entries.iter().any(|entry| {
        fs::symlink_metadata(entry.path())
            .map(|metadata| !metadata.is_file())
            .unwrap_or(true)
    }) {
        return Ok(false);
    }
    for entry in entries {
        fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
    }
    File::open(root)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())?;
    Ok(true)
}

pub(super) fn clear_identity(root: &Path) -> Result<(), String> {
    match fs::remove_file(root.join(IDENTITY_FILE)) {
        Ok(()) => File::open(root)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
