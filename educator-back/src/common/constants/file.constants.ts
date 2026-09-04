// --- Server configuration constants ----------------------------------------
/** Default HTTP port when PORT env-var is not set. */
export const DEFAULT_PORT = 4000;
/** Maximum allowed JSON body size (Express default is 100 KB; reports can exceed that). */
export const HTTP_BODY_SIZE_LIMIT = '50mb';
