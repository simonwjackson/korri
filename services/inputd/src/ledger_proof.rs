use std::env;
use std::ffi::CString;
use std::fs::File;
use std::io::{self, Read, Write};
use std::mem::MaybeUninit;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};

const GENERIC_ERROR: &str = "ledger proof is not safely readable or writable";
const MAX_PROOF_BYTES: usize = 1024 * 1024;
const BASELINE: &[u8] = b"baseline.predicates";
const ACCEPTED: &[u8] = b"sunshine-private-state.accepted";
const RESOLVE_NO_SYMLINKS: u64 = 0x04;
const RENAME_NOREPLACE: u32 = 1;

#[repr(C)]
struct OpenHow {
    flags: u64,
    mode: u64,
    resolve: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Snapshot {
    dev: u64,
    ino: u64,
    mode: u32,
    uid: u32,
    nlink: u64,
    size: i64,
    mtime_sec: i64,
    mtime_nsec: i64,
    ctime_sec: i64,
    ctime_nsec: i64,
}

impl Snapshot {
    fn from_fd(fd: RawFd) -> io::Result<Self> {
        let mut raw = MaybeUninit::<libc::stat>::uninit();
        if unsafe { libc::fstat(fd, raw.as_mut_ptr()) } != 0 {
            return Err(io::Error::last_os_error());
        }
        let raw = unsafe { raw.assume_init() };
        Ok(Self {
            dev: raw.st_dev,
            ino: raw.st_ino,
            mode: raw.st_mode,
            uid: raw.st_uid,
            nlink: raw.st_nlink,
            size: raw.st_size,
            mtime_sec: raw.st_mtime,
            mtime_nsec: raw.st_mtime_nsec,
            ctime_sec: raw.st_ctime,
            ctime_nsec: raw.st_ctime_nsec,
        })
    }

    fn kind(&self) -> u32 {
        self.mode & libc::S_IFMT
    }
}

fn c_string(bytes: &[u8]) -> io::Result<CString> {
    CString::new(bytes).map_err(|_| io::Error::from_raw_os_error(libc::EINVAL))
}

fn open_absolute_no_symlinks(path: &Path, flags: i32) -> io::Result<OwnedFd> {
    let path = c_string(path.as_os_str().as_bytes())?;
    let how = OpenHow {
        flags: (flags | libc::O_CLOEXEC) as u64,
        mode: 0,
        resolve: RESOLVE_NO_SYMLINKS,
    };
    let fd = unsafe {
        libc::syscall(
            libc::SYS_openat2,
            libc::AT_FDCWD,
            path.as_ptr(),
            &how,
            std::mem::size_of::<OpenHow>(),
        ) as i32
    };
    if fd < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(unsafe { OwnedFd::from_raw_fd(fd) })
    }
}

fn open_at(parent: RawFd, name: &[u8], flags: i32, mode: u32) -> io::Result<OwnedFd> {
    let name = c_string(name)?;
    let fd = unsafe { libc::openat(parent, name.as_ptr(), flags | libc::O_CLOEXEC, mode) };
    if fd < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(unsafe { OwnedFd::from_raw_fd(fd) })
    }
}

fn proof_name(value: &str) -> io::Result<&'static [u8]> {
    match value.as_bytes() {
        BASELINE => Ok(BASELINE),
        ACCEPTED => Ok(ACCEPTED),
        _ => Err(io::Error::from_raw_os_error(libc::EINVAL)),
    }
}

fn open_ledger(path: &Path) -> io::Result<(OwnedFd, Snapshot)> {
    let fd =
        open_absolute_no_symlinks(path, libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW)?;
    let snapshot = Snapshot::from_fd(fd.as_raw_fd())?;
    if snapshot.kind() != libc::S_IFDIR
        || snapshot.uid != unsafe { libc::geteuid() }
        || snapshot.mode & 0o777 != 0o700
    {
        return Err(io::Error::from_raw_os_error(libc::EPERM));
    }
    Ok((fd, snapshot))
}

fn validate_proof(snapshot: Snapshot) -> io::Result<()> {
    if snapshot.kind() != libc::S_IFREG
        || snapshot.uid != unsafe { libc::geteuid() }
        || snapshot.mode & 0o777 != 0o600
        || snapshot.nlink != 1
        || snapshot.size <= 0
        || snapshot.size as usize > MAX_PROOF_BYTES
    {
        return Err(io::Error::from_raw_os_error(libc::EPERM));
    }
    Ok(())
}

fn same_entry_identity(left: Snapshot, right: Snapshot) -> bool {
    left.dev == right.dev
        && left.ino == right.ino
        && left.kind() == right.kind()
        && left.uid == right.uid
        && left.mode & 0o777 == right.mode & 0o777
}

fn rebind_ledger(path: &Path, expected: Snapshot) -> io::Result<()> {
    let rebound =
        open_absolute_no_symlinks(path, libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW)?;
    if !same_entry_identity(Snapshot::from_fd(rebound.as_raw_fd())?, expected) {
        return Err(io::Error::from_raw_os_error(libc::ESTALE));
    }
    Ok(())
}

fn read_proof_with_hook<F>(ledger: &Path, name: &[u8], hook: F) -> io::Result<Vec<u8>>
where
    F: FnOnce(),
{
    let (ledger_fd, ledger_snapshot) = open_ledger(ledger)?;
    let fd = open_at(
        ledger_fd.as_raw_fd(),
        name,
        libc::O_RDONLY | libc::O_NONBLOCK | libc::O_NOFOLLOW,
        0,
    )?;
    let snapshot = Snapshot::from_fd(fd.as_raw_fd())?;
    validate_proof(snapshot)?;
    let mut file = File::from(fd);
    let mut content = Vec::with_capacity(snapshot.size as usize);
    (&mut file)
        .take((MAX_PROOF_BYTES + 1) as u64)
        .read_to_end(&mut content)?;
    let fd: OwnedFd = file.into();
    if content.is_empty()
        || content.len() > MAX_PROOF_BYTES
        || Snapshot::from_fd(fd.as_raw_fd())? != snapshot
    {
        return Err(io::Error::from_raw_os_error(libc::ESTALE));
    }

    hook();

    let rebound = open_at(
        ledger_fd.as_raw_fd(),
        name,
        libc::O_PATH | libc::O_NOFOLLOW,
        0,
    )?;
    if Snapshot::from_fd(rebound.as_raw_fd())? != snapshot
        || !same_entry_identity(Snapshot::from_fd(ledger_fd.as_raw_fd())?, ledger_snapshot)
    {
        return Err(io::Error::from_raw_os_error(libc::ESTALE));
    }
    rebind_ledger(ledger, ledger_snapshot)?;
    Ok(content)
}

fn read_proof(ledger: &Path, name: &[u8]) -> io::Result<Vec<u8>> {
    read_proof_with_hook(ledger, name, || {})
}

fn random_suffix() -> io::Result<String> {
    let mut bytes = [0u8; 16];
    let count =
        unsafe { libc::getrandom(bytes.as_mut_ptr().cast::<libc::c_void>(), bytes.len(), 0) };
    if count != bytes.len() as isize {
        return Err(io::Error::last_os_error());
    }
    Ok(bytes.iter().map(|value| format!("{value:02x}")).collect())
}

struct TempEntry {
    directory: RawFd,
    name: CString,
    active: bool,
}

impl Drop for TempEntry {
    fn drop(&mut self) {
        if self.active {
            unsafe {
                libc::unlinkat(self.directory, self.name.as_ptr(), 0);
            }
        }
    }
}

fn write_new_proof(ledger: &Path, name: &[u8], content: &[u8]) -> io::Result<()> {
    if content.is_empty() || content.len() > MAX_PROOF_BYTES {
        return Err(io::Error::from_raw_os_error(libc::EINVAL));
    }
    let (ledger_fd, ledger_snapshot) = open_ledger(ledger)?;
    let suffix = random_suffix()?;
    let mut temp_name = b".korri-proof.next.".to_vec();
    temp_name.extend_from_slice(suffix.as_bytes());
    let temp_c = c_string(&temp_name)?;
    let temp_fd = open_at(
        ledger_fd.as_raw_fd(),
        &temp_name,
        libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW,
        0o600,
    )?;
    let mut guard = TempEntry {
        directory: ledger_fd.as_raw_fd(),
        name: temp_c,
        active: true,
    };
    let snapshot = Snapshot::from_fd(temp_fd.as_raw_fd())?;
    if snapshot.kind() != libc::S_IFREG
        || snapshot.uid != unsafe { libc::geteuid() }
        || snapshot.mode & 0o777 != 0o600
        || snapshot.nlink != 1
    {
        return Err(io::Error::from_raw_os_error(libc::EPERM));
    }
    let mut file = File::from(temp_fd);
    file.write_all(content)?;
    file.sync_all()?;
    let temp_fd: OwnedFd = file.into();
    let written = Snapshot::from_fd(temp_fd.as_raw_fd())?;
    validate_proof(written)?;
    if written.size as usize != content.len() {
        return Err(io::Error::from_raw_os_error(libc::ESTALE));
    }
    if !same_entry_identity(Snapshot::from_fd(ledger_fd.as_raw_fd())?, ledger_snapshot) {
        return Err(io::Error::from_raw_os_error(libc::ESTALE));
    }
    rebind_ledger(ledger, ledger_snapshot)?;

    let target = c_string(name)?;
    let result = unsafe {
        libc::syscall(
            libc::SYS_renameat2,
            ledger_fd.as_raw_fd(),
            guard.name.as_ptr(),
            ledger_fd.as_raw_fd(),
            target.as_ptr(),
            RENAME_NOREPLACE,
        ) as i32
    };
    if result != 0 {
        return Err(io::Error::last_os_error());
    }
    guard.active = false;
    if unsafe { libc::fsync(ledger_fd.as_raw_fd()) } != 0 {
        return Err(io::Error::last_os_error());
    }
    rebind_ledger(ledger, ledger_snapshot)?;
    Ok(())
}

fn parse_args() -> Option<(String, PathBuf, &'static [u8])> {
    let mut args = env::args_os();
    let _program = args.next()?;
    let command = args.next()?.into_string().ok()?;
    let ledger = PathBuf::from(args.next()?);
    let name = args.next()?.into_string().ok()?;
    if args.next().is_some() {
        return None;
    }
    Some((command, ledger, proof_name(&name).ok()?))
}

fn run() -> io::Result<()> {
    let (command, ledger, name) =
        parse_args().ok_or_else(|| io::Error::from_raw_os_error(libc::EINVAL))?;
    match command.as_str() {
        "read" => {
            let content = read_proof(&ledger, name)?;
            io::stdout().write_all(&content)?;
        }
        "write-new" => {
            let mut content = Vec::new();
            io::stdin()
                .take((MAX_PROOF_BYTES + 1) as u64)
                .read_to_end(&mut content)?;
            write_new_proof(&ledger, name, &content)?;
        }
        _ => return Err(io::Error::from_raw_os_error(libc::EINVAL)),
    }
    Ok(())
}

fn main() {
    if run().is_err() {
        eprintln!("{GENERIC_ERROR}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use tempfile::TempDir;

    fn fixture() -> (TempDir, PathBuf) {
        let temp = TempDir::new().unwrap();
        let ledger = temp.path().join("ledger");
        fs::create_dir(&ledger).unwrap();
        fs::set_permissions(&ledger, fs::Permissions::from_mode(0o700)).unwrap();
        (temp, ledger)
    }

    #[test]
    fn writes_and_reads_one_exact_proof() {
        let (_temp, ledger) = fixture();
        write_new_proof(&ledger, BASELINE, b"proof\n").unwrap();
        assert_eq!(read_proof(&ledger, BASELINE).unwrap(), b"proof\n");
        assert!(write_new_proof(&ledger, BASELINE, b"other\n").is_err());
    }

    #[test]
    fn never_follows_next_or_final_symlinks() {
        let (temp, ledger) = fixture();
        let outside = temp.path().join("outside");
        fs::write(&outside, b"outside\n").unwrap();
        symlink(&outside, ledger.join("baseline.predicates.next")).unwrap();
        write_new_proof(&ledger, BASELINE, b"proof\n").unwrap();
        assert_eq!(fs::read(&outside).unwrap(), b"outside\n");

        let (_temp, ledger) = fixture();
        let outside = ledger.parent().unwrap().join("outside-final");
        fs::write(&outside, b"outside\n").unwrap();
        symlink(&outside, ledger.join("sunshine-private-state.accepted")).unwrap();
        assert!(write_new_proof(&ledger, ACCEPTED, b"digest\n").is_err());
        assert!(read_proof(&ledger, ACCEPTED).is_err());
        assert_eq!(fs::read(&outside).unwrap(), b"outside\n");
    }

    #[test]
    fn rejects_hard_links_and_wrong_modes() {
        for name in [BASELINE, ACCEPTED] {
            let (_temp, ledger) = fixture();
            let outside = ledger.parent().unwrap().join("outside");
            fs::write(&outside, b"proof\n").unwrap();
            fs::set_permissions(&outside, fs::Permissions::from_mode(0o600)).unwrap();
            fs::hard_link(&outside, ledger.join(std::str::from_utf8(name).unwrap())).unwrap();
            assert!(read_proof(&ledger, name).is_err());

            let (_temp, ledger) = fixture();
            let path = ledger.join(std::str::from_utf8(name).unwrap());
            fs::write(&path, b"proof\n").unwrap();
            fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
            assert!(read_proof(&ledger, name).is_err());
        }
    }

    #[test]
    fn rejects_entry_replacement_after_read() {
        for name in [BASELINE, ACCEPTED] {
            let (_temp, ledger) = fixture();
            write_new_proof(&ledger, name, b"proof\n").unwrap();
            let target = ledger.join(std::str::from_utf8(name).unwrap());
            assert!(read_proof_with_hook(&ledger, name, || {
                fs::rename(&target, target.with_extension("old")).unwrap();
                fs::write(&target, b"replacement\n").unwrap();
                fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).unwrap();
            })
            .is_err());
        }
    }
}
