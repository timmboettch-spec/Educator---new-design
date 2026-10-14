export enum VoiceProfileStatus {
  ACTIVE = 'active',
  RETIRED = 'retired',
}

export enum VoiceProfileGender {
  FEMALE = 'female',
  MALE = 'male',
}

/** Where a scenario's effective voice came from (C1 `voiceProfile.source`). */
export enum VoiceProfileSource {
  SCENARIO = 'scenario',
  GENDER_DEFAULT = 'gender_default',
}

/** `?status=` filter on the list route; `all` means active and retired. */
export enum VoiceProfileListStatus {
  ACTIVE = 'active',
  ALL = 'all',
}

export const VoiceProfileConstants = {
  SWAGGER: {
    TAG: 'Voice Profiles',
  },
  ROUTES: {
    BASE: 'voice-profiles',
    ID: ':id',
    AUDIO: ':id/audio',
  },
  DB: {
    ENUM_STATUS: 'voice_profile_status',
    ENUM_GENDER: 'voice_profile_gender',
    UQ_DEFAULT_FOR_GENDER_ACTIVE: 'UQ_voice_profiles_default_for_gender_active',
    UQ_DISPLAY_NAME_ACTIVE: 'UQ_voice_profiles_display_name_active',
    IDX_SIMULATIONS_V2_VOICE_PROFILE_ID: 'IDX_simulations_v2_voice_profile_id',
    FK_SIMULATIONS_V2_VOICE_PROFILE: 'FK_simulations_v2_voice_profile',
  },
  VALIDATION: {
    DISPLAY_NAME_MIN_LENGTH: 1,
    DISPLAY_NAME_MAX_LENGTH: 100,
    BLOB_PATH_MAX_LENGTH: 255,
    /** Free-text demographic/performance tags — gender, ethnicity, emotion. */
    TAG_MAX_LENGTH: 50,
    AGE_MIN: 0,
    AGE_MAX: 120,
  },
  UPLOAD: {
    FIELD_NAME: 'file',
    MAX_FILE_BYTES: 20 * 1024 * 1024,
  },
  BLOB: {
    PATH_PREFIX: 'voices',
    FILE_NAME: 'voice.wav',
    CONTENT_TYPE: 'audio/wav',
  },
  AUDIO: {
    MIN_DURATION_S: 5,
    MAX_DURATION_S: 30,
    /** Normalised output is cut to this length. */
    OUTPUT_MAX_S: 10,
    OUTPUT_SAMPLE_RATE: 24000,
    OUTPUT_CHANNELS: 1,
    OUTPUT_CODEC: 'pcm_s16le',
    SILENCE_THRESHOLD_DB: -50,
    SILENCE_MIN_DURATION_S: 0.5,
    /** Reject when more than this share of the input is silence. */
    MAX_SILENCE_RATIO: 0.5,
    /** Clipping: max_volume at or above this AND more than CLIP_MAX_0DB_RATIO samples at 0 dB. */
    CLIP_MAX_VOLUME_DB: -0.1,
    CLIP_MAX_0DB_RATIO: 0.01,
    /** Leading/trailing trim keeps this much of the quiet lead-in, in seconds. */
    TRIM_KEEP_SILENCE_S: 0.1,
    LOUDNORM_I: -20,
    LOUDNORM_TP: -1.5,
    LOUDNORM_LRA: 11,
    PROCESS_TIMEOUT_MS: 20_000,
    FFMPEG_BIN: 'ffmpeg',
    FFPROBE_BIN: 'ffprobe',
  },
  STREAM: {
    AUTHED_CACHE_CONTROL: 'private, max-age=600',
  },
  RETIRE: {
    /** How many referencing scenario ids the 409 message names. */
    MAX_LISTED_SCENARIO_IDS: 5,
  },
  GENDER_FEMALE_ALIASES: ['female', 'f'],
};
