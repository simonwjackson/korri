use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::{HashMap, HashSet};
use typeshare::typeshare;

use crate::{GameIdentity, SessionControlValue};

type HmacSha256 = Hmac<Sha256>;
const RETROARCH_CONTROL_TOKEN: &str = "KORRI_CONTROL_TOKEN";
const RETROARCH_CONTROL_CONTEXT: &[u8] = b"korri-retroarch-control-v1";

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LocalGame {
    pub id: String,
    pub title: String,
    pub system: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<GameIdentity>,
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
    /** Identity created by korrid while preparing this exact launch. */
    pub launch_id: String,
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
        push(&self.launch_id, &mut bytes);
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

    pub(crate) fn with_launch_id(mut self, launch_id: String) -> Self {
        self.launch_id = launch_id;
        self
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

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MoonlightLaunchSpec {
    /** Fresh identity created by korrid for this native stream startup. */
    pub launch_id: String,
    pub transport_id: String,
    pub implementation: crate::MoonlightImplementation,
    pub sunshine_app: String,
    pub host_uuid: String,
    pub app_id: u32,
    /** Per-server HMAC. The portal transports it opaquely; native consumes it once. */
    pub integrity: String,
}

impl MoonlightLaunchSpec {
    fn signing_bytes(&self) -> Vec<u8> {
        fn push(value: &[u8], bytes: &mut Vec<u8>) {
            bytes.extend_from_slice(&(value.len() as u64).to_be_bytes());
            bytes.extend_from_slice(value);
        }

        let mut bytes = Vec::new();
        push(self.launch_id.as_bytes(), &mut bytes);
        push(self.transport_id.as_bytes(), &mut bytes);
        push(
            &serde_json::to_vec(&self.implementation).expect("Moonlight implementation serializes"),
            &mut bytes,
        );
        push(self.sunshine_app.as_bytes(), &mut bytes);
        push(self.host_uuid.as_bytes(), &mut bytes);
        push(&self.app_id.to_be_bytes(), &mut bytes);
        bytes
    }

    fn sign(mut self, key: &[u8]) -> Self {
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
        mac.update(&self.signing_bytes());
        self.integrity = hex::encode(mac.finalize().into_bytes());
        self
    }

    fn verify(&self, key: &[u8]) -> bool {
        let Ok(signature) = hex::decode(&self.integrity) else {
            return false;
        };
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
        mac.update(&self.signing_bytes());
        mac.verify_slice(&signature).is_ok()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MoonlightLaunchVerificationFailure {
    Integrity,
    Stale,
    Replay,
}

struct CurrentMoonlightLaunch {
    id: String,
    consumed: bool,
}

/** Per-server signer and one-use native verifier for Moonlight startup. */
pub struct MoonlightLaunchAuthority {
    key: Vec<u8>,
    current_launch: Option<CurrentMoonlightLaunch>,
}

impl MoonlightLaunchAuthority {
    pub fn new(key: Vec<u8>) -> Self {
        Self {
            key,
            current_launch: None,
        }
    }

    pub fn prepare(
        &mut self,
        transport_id: impl Into<String>,
        implementation: crate::MoonlightImplementation,
        sunshine_app: impl Into<String>,
        host_uuid: impl Into<String>,
        app_id: u32,
    ) -> MoonlightLaunchSpec {
        let launch_id = hex::encode(rand::random::<[u8; 16]>());
        let spec = MoonlightLaunchSpec {
            launch_id: launch_id.clone(),
            transport_id: transport_id.into(),
            implementation,
            sunshine_app: sunshine_app.into(),
            host_uuid: host_uuid.into(),
            app_id,
            integrity: String::new(),
        }
        .sign(&self.key);
        self.current_launch = Some(CurrentMoonlightLaunch {
            id: launch_id,
            consumed: false,
        });
        spec
    }

    pub fn authorize(
        &mut self,
        spec: &MoonlightLaunchSpec,
    ) -> Result<(), MoonlightLaunchVerificationFailure> {
        if !spec.verify(&self.key) {
            return Err(MoonlightLaunchVerificationFailure::Integrity);
        }
        let Some(current) = self.current_launch.as_mut() else {
            return Err(MoonlightLaunchVerificationFailure::Stale);
        };
        if current.id != spec.launch_id {
            return Err(MoonlightLaunchVerificationFailure::Stale);
        }
        if current.consumed {
            return Err(MoonlightLaunchVerificationFailure::Replay);
        }
        current.consumed = true;
        Ok(())
    }
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AndroidMoonlightEffect {
    Disconnect,
    QuitHost,
    ToggleKeyboard,
    ToggleFullKeyboard,
    SetFillMode,
    SetZoomMode,
    RotateScreen,
    ToggleHud,
    ToggleFloatingMenu,
    ToggleKeyboardController,
    SwitchTouchSensitivity,
    SetMouseMode,
    SetLocalCursor,
    SetSgsrEdgeThreshold,
    SetSgsrSharpness,
    SetFaceButtonFlip,
    SetRumble,
    SetPictureInPicture,
}

/** Closed platform effect vocabulary. Plugins may refer only to integrations
 * represented here; no process, URL, intent, socket, or method name crosses. */
#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", content = "payload", rename_all = "kebab-case")]
pub enum PlatformEffect {
    AndroidMoonlight(AndroidMoonlightEffect),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInstruction {
    pub launch_id: String,
    pub action_id: String,
    /** Cryptographically random, consumed once for the active launch. */
    pub nonce: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<SessionControlValue>,
    pub effect: PlatformEffect,
    /** Per-server HMAC verified at the native platform edge. */
    pub integrity: String,
}

impl PlatformInstruction {
    fn signing_bytes(&self) -> Vec<u8> {
        fn push(value: &[u8], bytes: &mut Vec<u8>) {
            bytes.extend_from_slice(&(value.len() as u64).to_be_bytes());
            bytes.extend_from_slice(value);
        }

        let mut bytes = Vec::new();
        push(self.launch_id.as_bytes(), &mut bytes);
        push(self.action_id.as_bytes(), &mut bytes);
        push(self.nonce.as_bytes(), &mut bytes);
        push(
            &serde_json::to_vec(&self.value).expect("control values serialize"),
            &mut bytes,
        );
        push(
            &serde_json::to_vec(&self.effect).expect("platform effects serialize"),
            &mut bytes,
        );
        bytes
    }

    pub fn protect(
        launch_id: impl Into<String>,
        action_id: impl Into<String>,
        value: Option<SessionControlValue>,
        effect: PlatformEffect,
        key: &[u8],
    ) -> Self {
        let nonce: [u8; 32] = rand::random();
        let mut instruction = Self {
            launch_id: launch_id.into(),
            action_id: action_id.into(),
            nonce: hex::encode(nonce),
            value,
            effect,
            integrity: String::new(),
        };
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
        mac.update(&instruction.signing_bytes());
        instruction.integrity = hex::encode(mac.finalize().into_bytes());
        instruction
    }

    fn verify(&self, key: &[u8]) -> bool {
        let Ok(signature) = hex::decode(&self.integrity) else {
            return false;
        };
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
        mac.update(&self.signing_bytes());
        mac.verify_slice(&signature).is_ok()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlatformInstructionVerificationFailure {
    Integrity,
    StaleSession,
    Replay,
}

/** Stateful native-edge authorization: integrity and launch binding are
 * checked before a nonce is atomically marked consumed. */
pub struct PlatformInstructionVerifier {
    active_launch_id: String,
    consumed_nonces: HashSet<String>,
}

impl PlatformInstructionVerifier {
    pub fn new(active_launch_id: impl Into<String>) -> Self {
        Self {
            active_launch_id: active_launch_id.into(),
            consumed_nonces: HashSet::new(),
        }
    }

    pub fn authorize(
        &mut self,
        instruction: &PlatformInstruction,
        key: &[u8],
    ) -> Result<(), PlatformInstructionVerificationFailure> {
        if !instruction.verify(key) {
            return Err(PlatformInstructionVerificationFailure::Integrity);
        }
        if instruction.launch_id != self.active_launch_id {
            return Err(PlatformInstructionVerificationFailure::StaleSession);
        }
        if !self.consumed_nonces.insert(instruction.nonce.clone()) {
            return Err(PlatformInstructionVerificationFailure::Replay);
        }
        Ok(())
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
            launch_id: "launch-1".into(),
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
    fn signed_moonlight_launches_reject_tamper_stale_and_replay() {
        let mut authority = MoonlightLaunchAuthority::new(b"private per-server key".to_vec());
        let first = authority.prepare(
            "@korri:moonlight/moonlight",
            crate::MoonlightImplementation::Artemis,
            "Korri Stream",
            "host-uuid",
            7,
        );
        assert_eq!(first.transport_id, "@korri:moonlight/moonlight");
        assert_eq!(first.sunshine_app, "Korri Stream");
        assert_eq!(first.host_uuid, "host-uuid");
        assert_eq!(first.app_id, 7);
        assert_eq!(first.launch_id.len(), 32);

        let second = authority.prepare(
            "@korri:moonlight/moonlight",
            crate::MoonlightImplementation::Artemis,
            "Korri Stream",
            "host-uuid",
            7,
        );
        assert_ne!(second.launch_id, first.launch_id);
        assert_eq!(
            authority
                .current_launch
                .as_ref()
                .map(|launch| (launch.id.as_str(), launch.consumed)),
            Some((second.launch_id.as_str(), false))
        );
        assert_eq!(
            authority.authorize(&first),
            Err(MoonlightLaunchVerificationFailure::Stale)
        );

        let mut tampered = second.clone();
        tampered.app_id = 8;
        assert_eq!(
            authority.authorize(&tampered),
            Err(MoonlightLaunchVerificationFailure::Integrity)
        );
        assert!(authority.authorize(&second).is_ok());
        assert!(authority
            .current_launch
            .as_ref()
            .is_some_and(|launch| launch.consumed));
        assert_eq!(
            authority.authorize(&second),
            Err(MoonlightLaunchVerificationFailure::Replay)
        );
    }

    #[test]
    fn protected_platform_instructions_reject_tampering_and_replay() {
        let key = b"private per-server key";
        let instruction = PlatformInstruction::protect(
            "launch-1",
            "fill",
            Some(SessionControlValue::Toggle(true)),
            PlatformEffect::AndroidMoonlight(AndroidMoonlightEffect::SetFillMode),
            key,
        );
        let mut verifier = PlatformInstructionVerifier::new("launch-1");
        assert!(verifier.authorize(&instruction, key).is_ok());
        assert_eq!(
            verifier.authorize(&instruction, key),
            Err(PlatformInstructionVerificationFailure::Replay)
        );
        assert_eq!(
            PlatformInstructionVerifier::new("replacement-launch").authorize(&instruction, key),
            Err(PlatformInstructionVerificationFailure::StaleSession)
        );

        let mutations: Vec<Box<dyn Fn(&mut PlatformInstruction)>> = vec![
            Box::new(|value| value.action_id = "quit".into()),
            Box::new(|value| value.value = Some(SessionControlValue::Toggle(false))),
            Box::new(|value| value.launch_id = "launch-2".into()),
            Box::new(|value| value.nonce = "other".into()),
            Box::new(|value| {
                value.effect = PlatformEffect::AndroidMoonlight(AndroidMoonlightEffect::SetZoomMode)
            }),
        ];
        for mutate in mutations {
            let mut tampered = instruction.clone();
            mutate(&mut tampered);
            assert_eq!(
                PlatformInstructionVerifier::new(&tampered.launch_id).authorize(&tampered, key),
                Err(PlatformInstructionVerificationFailure::Integrity)
            );
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
