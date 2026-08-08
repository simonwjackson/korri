use std::{
    collections::BTreeMap,
    ffi::{OsStr, OsString},
    io::Read,
    os::fd::AsRawFd,
    os::unix::net::UnixStream,
    path::PathBuf,
    time::Duration,
};

use korri_inputd::actions::{
    commands_from_environment, legacy_environment_name, ActionCommand, ActionConfigError,
    ActionDispatcher, ActionIdentity, ActionLimits, ActionOutcome, ACTION_IDS,
};

fn identity_requiring_privilege_drop() -> ActionIdentity {
    let uid = unsafe { libc::geteuid() };
    let control_gid = unsafe { libc::getegid() };
    if uid == 0 {
        ActionIdentity {
            uid: std::env::var("SUDO_UID")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(65_534),
            gid: std::env::var("SUDO_GID")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(65_534),
            control_gid,
        }
    } else {
        ActionIdentity {
            uid,
            gid: control_gid.saturating_add(10_000),
            control_gid,
        }
    }
}

#[test]
fn legacy_action_vocabulary_has_stable_configuration_names() {
    assert_eq!(ACTION_IDS.len(), 18);
    assert_eq!(
        legacy_environment_name("system-panel"),
        Some("KORRI_INPUTD_SYSTEM_PANEL")
    );
    assert_eq!(
        legacy_environment_name("toggle-bottom-keyboard"),
        Some("KORRI_INPUTD_BOTTOM_KEYBOARD")
    );
    assert_eq!(legacy_environment_name("unknown"), None);
}

#[test]
fn commands_require_absolute_executables_and_explicit_argv() {
    assert!(matches!(
        ActionCommand::new("swaymsg", [], BTreeMap::new()),
        Err(ActionConfigError::ExecutableNotAbsolute(_))
    ));

    let mut environment = BTreeMap::new();
    environment.insert(
        OsString::from("KORRI_INPUTD_SYSTEM_PANEL"),
        OsString::from("/bin/tool --flag"),
    );
    assert!(matches!(
        commands_from_environment(&environment),
        Err(ActionConfigError::CommandIsNotExplicitArgv)
    ));

    environment.insert(
        OsString::from("KORRI_INPUTD_SYSTEM_PANEL"),
        OsString::from(
            r#"{"executable":"/nix/store/tool/bin/tool","argv":["--flag","value with spaces"],"environment":{"SWAYSOCK":"/run/user/100/sway.sock"}}"#,
        ),
    );
    let commands = commands_from_environment(&environment).unwrap();
    let command = commands.get("system-panel").unwrap();
    assert_eq!(
        command.executable(),
        PathBuf::from("/nix/store/tool/bin/tool")
    );
    assert_eq!(
        command.argv(),
        [
            OsString::from("--flag"),
            OsString::from("value with spaces")
        ]
    );
    assert_eq!(
        command.environment().get(OsStr::new("SWAYSOCK")),
        Some(&OsString::from("/run/user/100/sway.sock"))
    );
}

#[test]
fn destructive_command_override_is_rejected() {
    let mut environment = BTreeMap::new();
    environment.insert(
        OsString::from("KORRI_INPUTD_KILL_CURRENT_GAME"),
        OsString::from(r#"["/bin/killall","game"]"#),
    );
    assert!(matches!(
        commands_from_environment(&environment),
        Err(ActionConfigError::DestructiveCommandOverride)
    ));
}

#[test]
fn environment_is_an_explicit_allowlist() {
    let mut allowed = BTreeMap::new();
    allowed.insert(
        OsString::from("SWAYSOCK"),
        OsString::from("/run/user/100/sway.sock"),
    );
    let command = ActionCommand::new("/nix/store/tool/bin/tool", [], allowed.clone()).unwrap();

    assert_eq!(command.environment(), &allowed);
    assert!(!command.environment().contains_key(OsStr::new("HOME")));
    assert!(matches!(
        ActionCommand::new(
            "/nix/store/tool/bin/tool",
            [],
            BTreeMap::from([(OsString::from("BAD=NAME"), OsString::from("value"))]),
        ),
        Err(ActionConfigError::InvalidEnvironmentName)
    ));
}

#[tokio::test]
async fn unconfigured_action_is_a_bounded_no_op() {
    let dispatcher = ActionDispatcher::new(
        Default::default(),
        identity_requiring_privilege_drop(),
        ActionLimits::default(),
    )
    .unwrap();

    assert_eq!(
        dispatcher.dispatch("workspace-next").await,
        ActionOutcome::Unconfigured
    );
}

#[test]
fn action_child_process_contract_probe() {
    let Some(path) = std::env::var_os("KORRI_TEST_CONTROL_SOCKET") else {
        return;
    };
    let inherited_fd = std::env::var("KORRI_TEST_INHERITED_FD")
        .unwrap()
        .parse::<i32>()
        .unwrap();
    assert!(std::fs::metadata(format!("/proc/self/fd/{inherited_fd}")).is_err());

    let mut stream = UnixStream::connect(path).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_millis(250)))
        .unwrap();
    let mut response = [0_u8; 1];
    assert_eq!(stream.read(&mut response).unwrap(), 0);
}

#[tokio::test]
async fn action_child_cannot_retain_or_reopen_local_control_authority() {
    let root = tempfile::tempdir().unwrap();
    let socket_path = root.path().join("control.sock");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(root.path(), std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    let listener = tokio::net::UnixListener::bind(&socket_path).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o777)).unwrap();
    }
    let expected_uid = unsafe { libc::geteuid() };
    let expected_gid = unsafe { libc::getegid() };
    let server = tokio::spawn(async move {
        let accepted = tokio::time::timeout(Duration::from_millis(500), listener.accept()).await;
        let Ok(Ok((stream, _))) = accepted else {
            return None;
        };
        let credentials = stream.peer_cred().unwrap();
        if credentials.uid() == expected_uid && credentials.gid() == expected_gid {
            use tokio::io::AsyncWriteExt;
            let mut stream = stream;
            stream.write_all(b"A").await.unwrap();
        }
        Some((credentials.uid(), credentials.gid()))
    });

    let (retained, _peer) = UnixStream::pair().unwrap();
    let fd = retained.as_raw_fd();
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFD) };
    assert!(flags >= 0);
    assert_eq!(
        unsafe { libc::fcntl(fd, libc::F_SETFD, flags & !libc::FD_CLOEXEC) },
        0
    );

    let executable = std::env::current_exe().unwrap();
    let environment = BTreeMap::from([
        (
            OsString::from("KORRI_TEST_CONTROL_SOCKET"),
            socket_path.as_os_str().to_owned(),
        ),
        (
            OsString::from("KORRI_TEST_INHERITED_FD"),
            OsString::from(fd.to_string()),
        ),
    ]);
    let command = ActionCommand::new(
        executable,
        [
            OsString::from("--exact"),
            OsString::from("action_child_process_contract_probe"),
            OsString::from("--nocapture"),
        ],
        environment,
    )
    .unwrap();
    let mut commands = korri_inputd::actions::ActionCommands::default();
    commands.insert("workspace-next", command);
    let identity = identity_requiring_privilege_drop();
    let dispatcher = ActionDispatcher::new(
        commands,
        identity,
        ActionLimits {
            max_concurrency: 1,
            timeout: Duration::from_secs(2),
            max_output_bytes: 4096,
        },
    )
    .unwrap();

    let outcome = dispatcher.dispatch("workspace-next").await;
    let observed = server.await.unwrap();
    if unsafe { libc::geteuid() } == 0 {
        assert!(
            matches!(outcome, ActionOutcome::Completed(_)),
            "unexpected privileged action outcome: {outcome:?}"
        );
        assert_eq!(observed, Some((identity.uid, identity.gid)));
    } else {
        assert!(matches!(outcome, ActionOutcome::SpawnFailed(_)));
        assert_eq!(observed, None);
    }
}

#[tokio::test]
async fn child_fails_closed_when_group_drop_cannot_be_proven() {
    if unsafe { libc::geteuid() } == 0 {
        return;
    }
    let executable = std::fs::canonicalize("/run/current-system/sw/bin/true").unwrap();
    let command = ActionCommand::new(executable, [], BTreeMap::new()).unwrap();
    let mut commands = korri_inputd::actions::ActionCommands::default();
    commands.insert("workspace-next", command);
    let dispatcher = ActionDispatcher::new(
        commands,
        identity_requiring_privilege_drop(),
        ActionLimits {
            max_concurrency: 1,
            timeout: Duration::from_secs(1),
            max_output_bytes: 128,
        },
    )
    .unwrap();

    assert!(matches!(
        dispatcher.dispatch("workspace-next").await,
        ActionOutcome::SpawnFailed(_)
    ));
}
