//! THROWAWAY PROTOTYPE: minimal Android edge for the Rust server core.

use crate::{korrid_spike_version, start_local_server, stop_local_server};
use jni::{
    objects::JClass,
    sys::{jint, jstring},
    JNIEnv,
};
use std::ptr;

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_spike_RustKorridSpike_version(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    match env.new_string(korrid_spike_version()) {
        Ok(value) => value.into_raw(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_spike_RustKorridSpike_start(
    mut env: JNIEnv,
    _class: JClass,
) -> jint {
    match start_local_server() {
        Ok(port) => port.into(),
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
            -1
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_simonwjackson_korri_spike_RustKorridSpike_stop(
    mut env: JNIEnv,
    _class: JClass,
) {
    if let Err(error) = stop_local_server() {
        let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
    }
}
