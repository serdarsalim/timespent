export const APP_NAME = "SLMTRACK";

export const APP_DESCRIPTION =
  "SLMTRACK is a minimalist personal goal-setting workspace for designing your schedule, tracking productivity across every time horizon, and running focused personal OKRs.";

export const APP_LONG_DESCRIPTION = `${APP_DESCRIPTION} Map your personal task and work schedule, track productivity across quarters, years, weeks, and days, and keep personal OKRs visible without adding weight to the minimalist interface.`;

export const APP_TAGLINE = "Personal goal setting & tracking app";

export const APP_FEATURES = [
  "Schedule planning",
  "Productivity timeline",
  "Personal OKRs",
  "Minimal design",
];

const createStorageKey = (prefix: string, suffix: string) => `${prefix}-${suffix}`;

export const APP_STORAGE_PREFIX = "slmtrack";
export const LEGACY_STORAGE_PREFIX = "timespent";

export const storageKey = (suffix: string) =>
  createStorageKey(APP_STORAGE_PREFIX, suffix);

export const legacyStorageKey = (suffix: string) =>
  createStorageKey(LEGACY_STORAGE_PREFIX, suffix);
