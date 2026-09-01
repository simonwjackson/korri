#include <cstddef>
#include <cstdint>

extern "C" {
#include "libavcodec/nvenc.h"
}

namespace video {
#include "korri_nvenc_runtime_layout.h"
}

static_assert(NVENCAPI_MAJOR_VERSION == 12);
static_assert(NVENCAPI_MINOR_VERSION == 0);
static_assert(NV_ENC_INITIALIZE_PARAMS_VER == 0xf005000cU);
static_assert(NV_ENC_CONFIG_VER == 0xf008000cU);
static_assert(NV_ENC_RECONFIGURE_PARAMS_VER == 0xf001000cU);
static_assert(sizeof(NV_ENCODE_API_FUNCTION_LIST) == 2552);
static_assert(sizeof(NV_ENC_INITIALIZE_PARAMS) == 1808);
static_assert(sizeof(NV_ENC_CONFIG) == 3584);
static_assert(sizeof(NV_ENC_RECONFIGURE_PARAMS) == 1824);
static_assert(sizeof(NvencDynLoadFunctions) == sizeof(video::korri_nvenc_dynload_functions_t));
static_assert(offsetof(NvencContext, nvenc_dload_funcs) ==
              offsetof(video::korri_nvenc_context_t, nvenc_dload_funcs));
static_assert(offsetof(NvencDynLoadFunctions, nvenc_funcs) ==
              offsetof(video::korri_nvenc_dynload_functions_t, nvenc_funcs));
static_assert(offsetof(NV_ENCODE_API_FUNCTION_LIST, nvEncReconfigureEncoder) == 264);
static_assert(offsetof(NvencContext, registered_frames) ==
              offsetof(video::korri_nvenc_context_t, registered_frames));
static_assert(sizeof(((NvencContext *) nullptr)->registered_frames) ==
              sizeof(((video::korri_nvenc_context_t *) nullptr)->registered_frames));
static_assert(sizeof(((NvencContext *) nullptr)->registered_frames[0]) ==
              sizeof(video::korri_nvenc_registered_frame_t));
static_assert(offsetof(NvencContext, init_encode_params) ==
              offsetof(video::korri_nvenc_context_t, init_encode_params));
static_assert(offsetof(NvencContext, encode_config) ==
              offsetof(video::korri_nvenc_context_t, encode_config));
static_assert(offsetof(NvencContext, support_dyn_bitrate) ==
              offsetof(video::korri_nvenc_context_t, support_dyn_bitrate));
static_assert(sizeof(((NvencContext *) nullptr)->support_dyn_bitrate) ==
              sizeof(((video::korri_nvenc_context_t *) nullptr)->support_dyn_bitrate));
static_assert(offsetof(NvencContext, nvencoder) ==
              offsetof(video::korri_nvenc_context_t, nvencoder));
static_assert(sizeof(((NvencContext *) nullptr)->nvencoder) ==
              sizeof(((video::korri_nvenc_context_t *) nullptr)->nvencoder));
static_assert(offsetof(NvencContext, rc) ==
              offsetof(video::korri_nvenc_context_t, rc));
static_assert(sizeof(((NvencContext *) nullptr)->rc) ==
              sizeof(((video::korri_nvenc_context_t *) nullptr)->rc));

int main() {
  return 0;
}
