//! Android edge: JNI functions mirroring
//! clients/android/.../korrid/KorridServer.java.

use crate::{
    active_android_launch, authorize_local_launch_spec, authorize_moonlight_launch_spec,
    authorize_platform_instruction, clear_active_android_launch, clear_moonlight_executor_state,
    korrid_version, local_server_capability, publish_local_active_launch,
    publish_moonlight_active_launch, publish_moonlight_executor_state,
    start_embedded_android_server, stop_local_server, MoonlightLaunchAuthorization,
};
use jni::{
    objects::{JClass, JObject, JString, JValue},
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
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_authorizeLaunchSpec(
    mut env: JNIEnv,
    _class: JClass,
    spec_json: JString,
    intent: JObject,
) -> jint {
    let spec_json: String = match env.get_string(&spec_json) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return 0;
        }
    };
    let Some(authorized) = authorize_local_launch_spec(&spec_json) else {
        return 0;
    };
    if let Some(authority) = authorized.retroarch_authority {
        let Ok(token) = std::str::from_utf8(authority.token_bytes()) else {
            return 0;
        };
        // Android Intent extras require a Java String while crossing into the
        // separate RetroArch process. It is transient, never logged or exposed
        // to JavaScript, and RetroArch removes the extra after native startup.
        let Ok(key) = env.new_string("KORRI_CONTROL_TOKEN") else {
            return 0;
        };
        let Ok(value) = env.new_string(token) else {
            return 0;
        };
        if env
            .call_method(
                intent,
                "putExtra",
                "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;",
                &[JValue::Object(&key), JValue::Object(&value)],
            )
            .is_err()
        {
            return 0;
        }
    }
    if authorized.publication_required {
        1
    } else {
        2
    }
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_publishLocalActiveLaunch(
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
    match publish_local_active_launch(&spec_json).and_then(|launch| {
        serde_json::to_string(&launch).map_err(|_| crate::ActiveAndroidLaunchFailure::InvalidSpec)
    }) {
        Ok(json) => env.new_string(json).map_or_else(
            |error| {
                let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
                ptr::null_mut()
            },
            |value| value.into_raw(),
        ),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalStateException", format!("{error:?}"));
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_publishMoonlightActiveLaunch(
    mut env: JNIEnv,
    _class: JClass,
    spec_json: JString,
    application_package: JString,
    game_class_name: JString,
) -> jstring {
    let spec_json: String = match env.get_string(&spec_json) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return ptr::null_mut();
        }
    };
    let application_package: String = match env.get_string(&application_package) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return ptr::null_mut();
        }
    };
    let game_class_name: String = match env.get_string(&game_class_name) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return ptr::null_mut();
        }
    };
    match publish_moonlight_active_launch(&spec_json, &application_package, &game_class_name)
        .and_then(|launch| {
            serde_json::to_string(&launch)
                .map_err(|_| crate::ActiveAndroidLaunchFailure::InvalidSpec)
        }) {
        Ok(json) => env.new_string(json).map_or_else(
            |error| {
                let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
                ptr::null_mut()
            },
            |value| value.into_raw(),
        ),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalStateException", format!("{error:?}"));
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_clearActiveLaunch(
    mut env: JNIEnv,
    _class: JClass,
    launch_id: JString,
) -> jboolean {
    let launch_id: String = match env.get_string(&launch_id) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return 0;
        }
    };
    clear_active_android_launch(&launch_id).into()
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_activeLaunch(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    let json = serde_json::to_string(&active_android_launch()).unwrap_or_else(|_| "null".into());
    match env.new_string(json) {
        Ok(value) => value.into_raw(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_publishMoonlightExecutorState(
    mut env: JNIEnv,
    _class: JClass,
    state_json: JString,
) -> jboolean {
    let state_json: String = match env.get_string(&state_json) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return 0;
        }
    };
    publish_moonlight_executor_state(&state_json).into()
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_clearMoonlightExecutorState(
    mut env: JNIEnv,
    _class: JClass,
    launch_id: JString,
    generation: JString,
) -> jboolean {
    let launch_id: String = match env.get_string(&launch_id) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return 0;
        }
    };
    let generation: String = match env.get_string(&generation) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return 0;
        }
    };
    clear_moonlight_executor_state(&launch_id, &generation).into()
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_korrid_KorridServer_authorizePlatformInstruction(
    mut env: JNIEnv,
    _class: JClass,
    instruction_json: JString,
) -> jstring {
    let instruction_json: String = match env.get_string(&instruction_json) {
        Ok(value) => value.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", error.to_string());
            return ptr::null_mut();
        }
    };
    let outcome = serde_json::to_string(&authorize_platform_instruction(&instruction_json))
        .unwrap_or_else(|_| "{\"_tag\":\"ServerUnavailable\"}".into());
    match env.new_string(outcome) {
        Ok(value) => value.into_raw(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
            ptr::null_mut()
        }
    }
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
