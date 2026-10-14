export enum AvatarStatus {
  SYNCING = 'syncing',
  READY = 'ready',
  RETIRED = 'retired',
}

export const AvatarConstants = {
  SWAGGER: {
    TAG: 'Avatars',
  },
  ROUTES: {
    BASE: 'avatars',
    ADMIN_BASE: 'admin/avatars',
  },
  VALIDATION: {
    /**
     * `avatar-10`, and nothing looser.
     *
     * The id is not just a key: pods are labelled with it, the blob path is
     * derived from it (`packages/avatars/<n>/`), and the avatar platform's
     * Session Router resolves a session by it. A typo that is merely a valid
     * string creates a catalog row nothing can serve.
     */
    AVATAR_ID_PATTERN: /^avatar-\d+$/,
    AVATAR_ID_MAX_LENGTH: 64,
    DISPLAY_NAME_MAX_LENGTH: 128,
    APPEARANCE_MAX_LENGTH: 255,
    /** Packaged UE map path, e.g. `/Game/Maps/Production/L_AVT_10`. */
    UNREAL_MAP_PATTERN: /^\/Game\/.+/,
    UNREAL_MAP_MAX_LENGTH: 255,
    ASSET_PATH_MAX_LENGTH: 255,
    VOICE_PROFILE_ID_MAX_LENGTH: 128,
    GPU_SKU_MAX_LENGTH: 64,
  },
  DEFAULTS: {
    /**
     * Mirror AvatarRecord's defaults in the avatar platform's Session Router
     * (services/session-router/models.py) so a row created without them
     * behaves exactly as the Router expects.
     */
    GPU_SKU: 'Standard_NV36ads_A10_v5',
    MIN_REPLICAS: 1,
    MAX_REPLICAS: 10,
    SCALE_TO_ZERO: true,
    PIXEL_STREAMING_VERSION: 2,
  },
};
