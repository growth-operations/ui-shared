// HubSpot forms fetcher (for form-selection pickers).
//
// Goes through callHubSpotApi → hubspot.fetch rules apply.
import { buildHubSpotUrl, callHubSpotApi } from "./base";

// context is accepted for signature consistency with the other fetchers (so
// callers can always pass (context, token, ...)), though forms needs no
// context fields.
export async function getForms(context, token) {
  const url = buildHubSpotUrl("marketing/v3/forms");
  return callHubSpotApi(url, token);
}
