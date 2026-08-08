use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use crate::action_catalog::ActionId;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionCgroup {
    name: String,
}

impl ActionCgroup {
    pub fn for_backend(name: impl Into<String>) -> io::Result<Self> {
        let name = name.into();
        if name.is_empty()
            || !name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "action cgroup backend name is invalid",
            ));
        }
        Ok(Self { name })
    }

    pub fn backend_name(&self) -> &str {
        &self.name
    }
}

pub trait ActionCgroupBackend: Send + Sync {
    fn create(&self, action: ActionId) -> io::Result<ActionCgroup>;
    fn attach(&self, cgroup: &ActionCgroup, pid: u32) -> io::Result<()>;
    fn contains(&self, cgroup: &ActionCgroup, pid: u32) -> io::Result<bool>;
    fn kill(&self, cgroup: &ActionCgroup) -> io::Result<()>;
    fn populated(&self, cgroup: &ActionCgroup) -> io::Result<bool>;
    fn remove(&self, cgroup: &ActionCgroup) -> io::Result<()>;
}

#[derive(Debug)]
pub struct FsActionCgroupBackend {
    action_root: PathBuf,
    sequence: AtomicU64,
}

impl FsActionCgroupBackend {
    pub fn delegated() -> io::Result<Self> {
        let current = current_cgroup_path()?;
        let action_root = Path::new("/sys/fs/cgroup").join(current).join("actions");
        fs::create_dir(&action_root).or_else(|error| {
            if error.kind() == io::ErrorKind::AlreadyExists {
                Ok(())
            } else {
                Err(error)
            }
        })?;
        require_regular_control(&action_root.join("cgroup.procs"))?;
        require_regular_control(&action_root.join("cgroup.events"))?;
        Ok(Self {
            action_root,
            sequence: AtomicU64::new(1),
        })
    }

    fn path(&self, cgroup: &ActionCgroup) -> PathBuf {
        self.action_root.join(&cgroup.name)
    }
}

impl ActionCgroupBackend for FsActionCgroupBackend {
    fn create(&self, action: ActionId) -> io::Result<ActionCgroup> {
        let sequence = self.sequence.fetch_add(1, Ordering::Relaxed);
        let cgroup = ActionCgroup {
            name: format!("{}-{sequence}", action.as_str()),
        };
        let path = self.path(&cgroup);
        fs::create_dir(&path)?;
        require_regular_control(&path.join("cgroup.procs"))?;
        require_regular_control(&path.join("cgroup.events"))?;
        require_regular_control(&path.join("cgroup.kill"))?;
        Ok(cgroup)
    }

    fn attach(&self, cgroup: &ActionCgroup, pid: u32) -> io::Result<()> {
        fs::write(self.path(cgroup).join("cgroup.procs"), pid.to_string())
    }

    fn contains(&self, cgroup: &ActionCgroup, pid: u32) -> io::Result<bool> {
        let processes = fs::read_to_string(self.path(cgroup).join("cgroup.procs"))?;
        Ok(processes
            .lines()
            .filter_map(|line| line.parse::<u32>().ok())
            .any(|contained| contained == pid))
    }

    fn kill(&self, cgroup: &ActionCgroup) -> io::Result<()> {
        fs::write(self.path(cgroup).join("cgroup.kill"), "1")
    }

    fn populated(&self, cgroup: &ActionCgroup) -> io::Result<bool> {
        let events = fs::read_to_string(self.path(cgroup).join("cgroup.events"))?;
        events
            .lines()
            .find_map(|line| line.strip_prefix("populated "))
            .map(|value| value == "1")
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    "cgroup.events has no populated field",
                )
            })
    }

    fn remove(&self, cgroup: &ActionCgroup) -> io::Result<()> {
        fs::remove_dir(self.path(cgroup))
    }
}

fn current_cgroup_path() -> io::Result<PathBuf> {
    let membership = fs::read_to_string("/proc/self/cgroup")?;
    let path = membership
        .lines()
        .find_map(|line| line.strip_prefix("0::"))
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::Unsupported,
                "process is not in a unified cgroup-v2 hierarchy",
            )
        })?;
    let relative = path.strip_prefix('/').unwrap_or(path);
    let relative = Path::new(relative);
    if relative
        .components()
        .any(|component| !matches!(component, std::path::Component::Normal(_)))
        && !relative.as_os_str().is_empty()
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "current cgroup path is not concrete",
        ));
    }
    Ok(relative.to_owned())
}

fn require_regular_control(path: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_file() {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("{} is not a regular cgroup control file", path.display()),
        ))
    }
}
