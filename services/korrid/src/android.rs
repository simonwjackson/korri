//! Android edge: JNI functions mirroring
//! clients/android/.../korrid/KorridServer.java.

use crate::{
    authorize_moonlight_launch_spec, korrid_version, local_server_capability,
    start_embedded_android_server, stop_local_server, verify_local_launch_spec,
    MoonlightLaunchAuthorization,
};
use jni::{
    objects::{JClass, JString},
    sys::{jboolean, jint, jstring},
    JNIEnv,
};
use std::ptr;

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_version(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    match env.new_string(korrid_version()) {
        Ok(value) => value.into_raw(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_start(
    mut env: JNIEnv,
    _class: JClass,
    allowed_origin: JString,
    local_storage_root: JString,
) -> jint {
    let allowed_origin: String = match env.get_string(&allowed_origin) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return -1;
        }
    };
    let local_storage_root: String = match env.get_string(&local_storage_root) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return -1;
        }
    };
    match start_embedded_android_server(&allowed_origin, &local_storage_root) {
        Ok(port) => port.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
            -1
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_capability(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    match local_server_capability() {
        Some(capability) => match env.new_string(capability) {
            Ok(value) => value.into_raw(),
            Err(error) => {
                let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
                ptr::null_mut()
            }
        },
        None => {
            let _ = env.throw_new("java/lang/IllegalStateException", "korrid is not running");
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_authorizeMoonlightLaunchSpec(
    mut env: JNIEnv,
    _class: JClass,
    spec_json: JString,
) -> jstring {
    let spec_json: String = match env.get_string(&spec_json) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return ptr::null_mut();
        }
    };
    let outcome = match authorize_moonlight_launch_spec(&spec_json) {
        MoonlightLaunchAuthorization::Authorized => "Authorized",
        MoonlightLaunchAuthorization::InvalidSpec => "InvalidSpec",
        MoonlightLaunchAuthorization::Integrity => "Integrity",
        MoonlightLaunchAuthorization::Stale => "Stale",
        MoonlightLaunchAuthorization::Replay => "Replay",
        MoonlightLaunchAuthorization::ServerUnavailable => "ServerUnavailable",
    };
    match env.new_string(outcome) {
        Ok(value) => value.into_raw(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_verifyLaunchSpec(
    mut env: JNIEnv,
    _class: JClass,
    spec_json: JString,
) -> jboolean {
    let spec_json: String = match env.get_string(&spec_json) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return 0;
        }
    };
    verify_local_launch_spec(&spec_json).into()
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_stop(
    mut env: JNIEnv,
    _class: JClass,
) {
    if let Err(error) = stop_local_server() {
        let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
    }
}
