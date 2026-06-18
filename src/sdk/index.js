// Growth Ops HubSpot app SDK — the token + API utility layer every token-using
// app reimplements, generalized to be app-agnostic. See README "SDK" section.

// App backend (context.variables.BASE_URL) via hubspot.fetch.
export { callAppApi, AppApiError } from "./app/base";
export { getAlerts, dismissAlert } from "./app/alerts";
export { getSettings, updateSettings, makeSettingsApi } from "./app/settings";
export {
  strToBase64,
  base64ToStr,
  getKeyFromContext,
  encrypt,
  decrypt,
} from "./app/encryption";

// HubSpot public API (api.hubapi.com) via a short-lived OAuth token.
export { callHubSpotApi, buildHubSpotUrl, HubSpotApiError } from "./hubspot/base";
export {
  getObjectProperties,
  getProperties,
  updateProperties,
} from "./hubspot/properties";
export { getForms } from "./hubspot/forms";
export { getLists } from "./hubspot/lists";
export {
  getPipelines,
  getPipelineStages,
  computeStageChanges,
} from "./hubspot/pipeline";

// Token lifecycle.
export { getShortLivedToken, isTokenExpired } from "./token/getShortLivedToken";
export { TokenProvider, useToken, TokenContext } from "./token/TokenContext";
