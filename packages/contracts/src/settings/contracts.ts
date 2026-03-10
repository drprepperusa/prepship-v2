export const ALLOWED_SETTINGS = [
  "rbMarkups",
  "rbSettings",
  "colVisibility",
  "colPrefs",
  "colWidths",
  "dateRange",
  "pageSize",
  "defaultView",
] as const;

export type AllowedSettingKey = (typeof ALLOWED_SETTINGS)[number];

