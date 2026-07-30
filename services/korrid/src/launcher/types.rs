use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use typeshare::typeshare;

type HmacSha256 = Hmac<Sha256>;
const RETROARCH_CONTROL_TOKEN: &str = "KORRI_CONTROL_TOKEN";
const RETROARCH_CONTROL_CONTEXT: &[u8] = b"korri-retroarch-control-v1";

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LocalGame {
    pub id: String,
    pub title: String,
    pub system: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidComponent {
    pub package_name: String,
    pub class_name: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ProvisionedFile {
    pub path: String,
    pub content: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSpec {
    pub launcher_id: String,
    pub component: AndroidComponent,
    pub extras: HashMap<String, String>,
    pub directories: Vec<String>,
    pub files: Vec<ProvisionedFile>,
    /// Per-server HMAC. The portal transports it opaquely; native verifies it.
    pub integrity: String,
}

impl LaunchSpec {
    fn signing_bytes(&self) -> Vec<u8> {
        fn push(value: &str, bytes: &mut Vec<u8>) {
            bytes.extend_from_slice(&(value.len() as u64).to_be_bytes());
            bytes.extend_from_slice(value.as_bytes());
        }

        let mut bytes = Vec::new();
        push(&self.launcher_id, &mut bytes);
        push(&self.component.package_name, &mut bytes);
        push(&self.component.class_name, &mut bytes);
        let mut extras: Vec<_> = self.extras.iter().collect();
        extras.sort_unstable_by_key(|(key, _)| *key);
        bytes.extend_from_slice(&(extras.len() as u64).to_be_bytes());
        for (key, value) in extras {
            push(key, &mut bytes);
            push(value, &mut bytes);
        }
        bytes.extend_from_slice(&(self.directories.len() as u64).to_be_bytes());
        for directory in &self.directories {
            push(directory, &mut bytes);
        }
        bytes.extend_from_slice(&(self.files.len() as u64).to_be_bytes());
        for file in &self.files {
            push(&file.path, &mut bytes);
            push(&file.content, &mut bytes);
        }
        bytes
    }

    pub(crate) fn sign(mut self, key: &[u8]) -> Self {
        if self.launcher_id == "retroarch" {
            let mut control_mac =
                HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
            control_mac.update(RETROARCH_CONTROL_CONTEXT);
            self.extras.insert(
                RETROARCH_CONTROL_TOKEN.into(),
                hex::encode(control_mac.finalize().into_bytes()),
            );
        }
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
        mac.update(&self.signing_bytes());
        self.integrity = hex::encode(mac.finalize().into_bytes());
        self
    }

    pub(crate) fn verify(&self, key: &[u8]) -> bool {
        let Ok(signature) = hex::decode(&self.integrity) else {
            return false;
        };
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
        mac.update(&self.signing_bytes());
        mac.verify_slice(&signature).is_ok()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FileProvisionMode {
    Direct,
    Deferred,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec() -> LaunchSpec {
        LaunchSpec {
            launcher_id: "retroarch".into(),
            component: AndroidComponent {
                package_name: "package".into(),
                class_name: "Activity".into(),
            },
            extras: HashMap::from([("ROM".into(), "/root/rom.gba".into())]),
            directories: vec!["/root/saves".into()],
            files: vec![ProvisionedFile {
                path: "/root/config".into(),
                content: "config".into(),
            }],
            integrity: String::new(),
        }
    }

    #[test]
    fn integrity_rejects_tampered_launcher_instructions() {
        let key = b"private per-server key";
        let signed = spec().sign(key);
        assert!(signed.verify(key));
        let control_token = signed
            .extras
            .get("KORRI_CONTROL_TOKEN")
            .expect("signed RetroArch spec has a control token");
        assert_eq!(control_token.len(), 64);
        assert_ne!(
            control_token,
            spec()
                .sign(b"another server key")
                .extras
                .get("KORRI_CONTROL_TOKEN")
                .unwrap()
        );

        let mut tampered_content = signed.clone();
        tampered_content.files[0].content = "kiosk_mode_enable = false".into();
        assert!(!tampered_content.verify(key));

        let mut tampered_extra = signed.clone();
        tampered_extra
            .extras
            .insert("QUITFOCUS".into(), "true".into());
        assert!(!tampered_extra.verify(key));
        let mut tampered_directory = signed;
        tampered_directory.directories[0] = "/outside".into();
        assert!(!tampered_directory.verify(key));
    }
}
