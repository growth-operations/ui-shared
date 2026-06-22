// @growth-operations/ui-shared — shared HubSpot UI-extension modules.
// Presentational components that render the /v1/home contract (see CONTRACT.md),
// branching on entitlement.mode ("trial_subscription" | "credits").

// The opinionated one-line Home integration.
export { AppHome, default as AppHomeDefault } from "./home/AppHome";

// Home building blocks.
export { InstallProgress } from "./home/InstallProgress";
export { HealthHero } from "./home/HealthHero";
export { OnboardingChecklist } from "./home/OnboardingChecklist";
export { SyncPulse } from "./home/SyncPulse";
export { FeatureNudges } from "./home/FeatureNudges";
export { CreditMeter } from "./home/CreditMeter";
export { HelpfulLinks } from "./home/HelpfulLinks";

// Billing.
export { BillingTab } from "./billing/BillingTab";
export { PlanGrid } from "./billing/PlanGrid";

// Alerts — the shared customer alerts table (level filter, sort, dismiss).
export { AlertsTab } from "./alerts/AlertsTab";

// Lib helpers.
export {
  fmtDate,
  fmtMoney,
  daysUntil,
  humanizeStatus,
  statusVariant,
  STATUS_LABELS,
  STATUS_VARIANT,
} from "./lib/format";
export { useStrictModeEffect } from "./lib/useStrictModeEffect";

// HubSpot URL builders (app.hubspot.com record/property/list links).
export {
  buildContactUrl,
  buildRecordUrl,
  buildObjectListUrl,
  buildContactListCreateUrl,
  buildContactListEditUrl,
  buildFormEditorUrl,
  buildPropertySettingsUrl,
  buildPropertyName,
  buildPropertyNames,
} from "./lib/urls";

// SDK — the token + API utility layer (see README "SDK" section and src/sdk/).
export {
  // App backend
  callAppApi,
  AppApiError,
  getAlerts,
  dismissAlert,
  getSettings,
  updateSettings,
  makeSettingsApi,
  // Encryption
  strToBase64,
  base64ToStr,
  getKeyFromContext,
  encrypt,
  decrypt,
  // HubSpot public API
  callHubSpotApi,
  buildHubSpotUrl,
  HubSpotApiError,
  getObjectProperties,
  getProperties,
  updateProperties,
  getForms,
  getLists,
  getPipelines,
  getPipelineStages,
  computeStageChanges,
  // Token lifecycle
  getShortLivedToken,
  isTokenExpired,
  TokenProvider,
  useToken,
  TokenContext,
} from "./sdk/index";
