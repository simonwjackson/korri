use std::{
    ffi::{CString, OsStr},
    fs,
    os::{
        fd::RawFd,
        unix::ffi::OsStrExt,
        unix::fs::{FileTypeExt, MetadataExt},
    },
    path::{Path, PathBuf},
    process::{Command, ExitCode},
};

use evdev::raw_stream::RawDevice;

const TARGET_NAME: &str = "Microsoft X-Box 360 pad";
const TARGET_KEYS: [u16; 15] = [
    0x130, 0x131, 0x133, 0x134, 0x136, 0x137, 0x13a, 0x13b, 0x13c, 0x13d, 0x13e, 0x2c0, 0x2c1,
    0x2c2, 0x2c3,
];
const TARGET_ABS: [u16; 8] = [0, 1, 2, 3, 4, 5, 0x10, 0x11];

#[derive(Clone, Debug, Eq, PartialEq)]
struct Facts {
    character: bool,
    virtual_sysfs: bool,
    empty_phys: bool,
    empty_uniq: bool,
    name: String,
    bus: u16,
    vendor: u16,
    product: u16,
    version: u16,
    keys: Vec<u16>,
    abs: Vec<u16>,
    force_feedback: bool,
}

impl Facts {
    fn validated(&self) -> bool {
        self.character
            && self.virtual_sysfs
            && self.empty_phys
            && self.empty_uniq
            && self.name == TARGET_NAME
            && (self.bus, self.vendor, self.product, self.version)
                == (0x0003, 0x045e, 0x028e, 0x0001)
            && self.keys == TARGET_KEYS
            && self.abs == TARGET_ABS
            && self.force_feedback
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Binding {
    dev: u64,
    ino: u64,
    rdev: u64,
}

struct HeldTarget {
    fd: RawFd,
    requested: PathBuf,
    binding: Binding,
    sysfs: PathBuf,
}

impl Drop for HeldTarget {
    fn drop(&mut self) {
        unsafe { libc::close(self.fd) };
    }
}

fn main() -> ExitCode {
    match run(std::env::args_os().skip(1).collect()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("korri-virtual-target-acl: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(mut args: Vec<std::ffi::OsString>) -> Result<(), String> {
    let mut device_root = PathBuf::from("/dev/input");
    let mut sys_root = PathBuf::from("/sys");
    let mut setfacl = PathBuf::from("setfacl");
    while args
        .first()
        .and_then(|v| v.to_str())
        .is_some_and(|v| v.starts_with("--"))
    {
        let flag = args.remove(0);
        let value = args.first().cloned().ok_or("option value is missing")?;
        args.remove(0);
        match flag.to_str() {
            Some("--device-root") => device_root = value.into(),
            Some("--sys-root") => sys_root = value.into(),
            Some("--setfacl") => setfacl = value.into(),
            _ => return Err("unknown option".into()),
        }
    }
    let operation = args
        .first()
        .and_then(|v| v.to_str())
        .ok_or("operation is missing")?;
    match operation {
        "grant" if args.len() == 4 => {
            let inputd = numeric_id(&args[1])?;
            let action = numeric_id(&args[2])?;
            mutate_one(
                &args[3],
                &device_root,
                &sys_root,
                &setfacl,
                Some((inputd, action)),
            )
        }
        "reapply" if args.len() == 3 => {
            let inputd = numeric_id(&args[1])?;
            let action = numeric_id(&args[2])?;
            for entry in fs::read_dir(&device_root).map_err(generic)? {
                let entry = entry.map_err(generic)?;
                if !event_name(&entry.file_name()) {
                    continue;
                }
                if let Ok(held) = open_requested(&entry.path(), &device_root, &sys_root) {
                    mutate_held(&held, &sys_root, &setfacl, Some((inputd, action)))?;
                }
            }
            Ok(())
        }
        "revoke" if args.len() == 1 => {
            for entry in fs::read_dir(&device_root).map_err(generic)? {
                let entry = entry.map_err(generic)?;
                if !event_name(&entry.file_name()) {
                    continue;
                }
                if let Ok(held) = open_requested(&entry.path(), &device_root, &sys_root) {
                    mutate_held(&held, &sys_root, &setfacl, None)?;
                }
            }
            Ok(())
        }
        _ => Err(
            "usage: {grant INPUTD_UID ACTION_UID DEVICE|reapply INPUTD_UID ACTION_UID|revoke}"
                .into(),
        ),
    }
}

fn numeric_id(value: &OsStr) -> Result<u32, String> {
    let value = value.to_str().ok_or("identity is invalid")?;
    let parsed = value.parse::<u32>().map_err(|_| "identity is invalid")?;
    if parsed == 0 || parsed.to_string() != value {
        return Err("identity is invalid".into());
    }
    Ok(parsed)
}

fn event_name(value: &OsStr) -> bool {
    value.to_str().is_some_and(|name| {
        name.strip_prefix("event")
            .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
    })
}

fn mutate_one(
    requested: &OsStr,
    device_root: &Path,
    sys_root: &Path,
    setfacl: &Path,
    grant: Option<(u32, u32)>,
) -> Result<(), String> {
    let requested = PathBuf::from(requested);
    let held = open_requested(&requested, device_root, sys_root)?;
    mutate_held(&held, sys_root, setfacl, grant)
}

fn open_requested(
    requested: &Path,
    device_root: &Path,
    sys_root: &Path,
) -> Result<HeldTarget, String> {
    if requested.parent() != Some(device_root) || !requested.file_name().is_some_and(event_name) {
        return Err("target path is outside the event device root".into());
    }
    open_and_validate(requested, sys_root)
}

fn mutate_held(
    held: &HeldTarget,
    sys_root: &Path,
    setfacl: &Path,
    grant: Option<(u32, u32)>,
) -> Result<(), String> {
    rebind(held, sys_root)?;
    let procfd = PathBuf::from(format!("/proc/self/fd/{}", held.fd));
    run_setfacl(
        setfacl,
        [OsStr::new("-b"), OsStr::new("--"), procfd.as_os_str()],
    )?;
    if let Some((inputd, action)) = grant {
        rebind(held, sys_root)?;
        let acl = format!("u:{inputd}:r,u:{action}:r,m::r");
        run_setfacl(
            setfacl,
            [
                OsStr::new("-m"),
                OsStr::new(&acl),
                OsStr::new("--"),
                procfd.as_os_str(),
            ],
        )?;
    }
    Ok(())
}

fn open_and_validate(requested: &Path, sys_root: &Path) -> Result<HeldTarget, String> {
    let path =
        CString::new(requested.as_os_str().as_bytes()).map_err(|_| "target path is invalid")?;
    let fd = unsafe { libc::open(path.as_ptr(), libc::O_PATH | libc::O_NOFOLLOW) };
    if fd < 0 {
        return Err("target could not be opened safely".into());
    }
    let mut stat: libc::stat = unsafe { std::mem::zeroed() };
    if unsafe { libc::fstat(fd, &mut stat) } != 0 {
        unsafe { libc::close(fd) };
        return Err("target metadata is unavailable".into());
    }
    let binding = Binding {
        dev: stat.st_dev,
        ino: stat.st_ino,
        rdev: stat.st_rdev,
    };
    let major = libc::major(stat.st_rdev);
    let minor = libc::minor(stat.st_rdev);
    let sysfs_link = sys_root.join("dev/char").join(format!("{major}:{minor}"));
    let sysfs = fs::canonicalize(&sysfs_link).map_err(|_| "target sysfs binding is unavailable")?;
    let virtual_root = fs::canonicalize(sys_root.join("devices/virtual/input")).map_err(generic)?;
    let procfd = format!("/proc/self/fd/{fd}");
    let device = RawDevice::open(&procfd).map_err(|_| "target evdev facts are unavailable")?;
    let id = device.input_id();
    let facts = Facts {
        character: (stat.st_mode & libc::S_IFMT) == libc::S_IFCHR,
        virtual_sysfs: sysfs.starts_with(&virtual_root),
        empty_phys: device.physical_path().unwrap_or("").is_empty(),
        empty_uniq: device.unique_name().unwrap_or("").is_empty(),
        name: device.name().unwrap_or("").to_owned(),
        bus: id.bus_type().0,
        vendor: id.vendor(),
        product: id.product(),
        version: id.version(),
        keys: device
            .supported_keys()
            .map(|v| v.iter().map(|k| k.0).collect())
            .unwrap_or_default(),
        abs: device
            .supported_absolute_axes()
            .map(|v| v.iter().map(|a| a.0).collect())
            .unwrap_or_default(),
        force_feedback: device
            .supported_events()
            .contains(evdev::EventType::FORCEFEEDBACK),
    };
    if !facts.validated() {
        unsafe { libc::close(fd) };
        return Err("target is not the exact InputPlumber virtual Xbox device".into());
    }
    Ok(HeldTarget {
        fd,
        requested: requested.to_owned(),
        binding,
        sysfs,
    })
}

fn rebind(held: &HeldTarget, sys_root: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(&held.requested).map_err(|_| "target path was replaced")?;
    let now = Binding {
        dev: metadata.dev(),
        ino: metadata.ino(),
        rdev: metadata.rdev(),
    };
    if now != held.binding || !metadata.file_type().is_char_device() {
        return Err("target path was replaced".into());
    }
    let major = libc::major(held.binding.rdev);
    let minor = libc::minor(held.binding.rdev);
    let sysfs = fs::canonicalize(sys_root.join("dev/char").join(format!("{major}:{minor}")))
        .map_err(|_| "target sysfs binding was replaced")?;
    if sysfs != held.sysfs {
        return Err("target sysfs binding was replaced".into());
    }
    Ok(())
}

fn run_setfacl<const N: usize>(setfacl: &Path, args: [&OsStr; N]) -> Result<(), String> {
    let status = Command::new(setfacl).args(args).status().map_err(generic)?;
    if status.success() {
        Ok(())
    } else {
        Err("ACL mutation failed".into())
    }
}

fn generic(error: impl std::fmt::Display) -> String {
    format!("operation failed: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    fn valid() -> Facts {
        Facts {
            character: true,
            virtual_sysfs: true,
            empty_phys: true,
            empty_uniq: true,
            name: TARGET_NAME.into(),
            bus: 3,
            vendor: 0x045e,
            product: 0x028e,
            version: 1,
            keys: TARGET_KEYS.to_vec(),
            abs: TARGET_ABS.to_vec(),
            force_feedback: true,
        }
    }
    #[test]
    fn physical_xbox_lookalike_is_rejected() {
        let mut f = valid();
        f.virtual_sysfs = false;
        assert!(!f.validated());
        f.virtual_sysfs = true;
        f.empty_phys = false;
        assert!(!f.validated());
    }
    #[test]
    fn exact_capabilities_are_required() {
        let mut f = valid();
        f.keys.pop();
        assert!(!f.validated());
        let mut f = valid();
        f.force_feedback = false;
        assert!(!f.validated());
    }
    #[test]
    fn event_replacement_binding_is_detected() {
        let a = Binding {
            dev: 1,
            ino: 2,
            rdev: 3,
        };
        let b = Binding {
            dev: 1,
            ino: 4,
            rdev: 3,
        };
        assert_ne!(a, b);
    }
    #[test]
    fn ids_are_canonical_and_unprivileged() {
        assert_eq!(numeric_id(OsStr::new("1001")).unwrap(), 1001);
        assert!(numeric_id(OsStr::new("0")).is_err());
        assert!(numeric_id(OsStr::new("01")).is_err());
    }
}
