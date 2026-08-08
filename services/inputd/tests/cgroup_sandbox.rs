use std::{process::Command, thread, time::Duration};

use korri_inputd::{
    action_catalog::ActionId,
    cgroup_sandbox::{ActionCgroupBackend, FsActionCgroupBackend},
};

#[test]
fn real_cgroup_v2_backend_kills_proves_empty_and_removes_when_delegated() {
    let Ok(backend) = FsActionCgroupBackend::delegated() else {
        return;
    };
    let cgroup = backend.create(ActionId::WorkspaceNext).unwrap();
    let mut child = Command::new("/run/current-system/sw/bin/sleep")
        .arg("30")
        .spawn()
        .unwrap();
    backend.attach(&cgroup, child.id()).unwrap();
    assert!(backend.contains(&cgroup, child.id()).unwrap());

    backend.kill(&cgroup).unwrap();
    let _ = child.wait().unwrap();
    for _ in 0..20 {
        if !backend.populated(&cgroup).unwrap() {
            backend.remove(&cgroup).unwrap();
            return;
        }
        thread::sleep(Duration::from_millis(5));
    }
    panic!("real action cgroup remained populated after cgroup.kill");
}
