// Billing-service SDK — direct calls to growth-ops-apps-app's billing
// endpoints (NOT the calling app's own backend, NOT api.hubapi.com). Every
// consuming app already allowlists ${BILLING_BASE_URL} under
// permittedUrls.fetch (it's also used for the Stripe-redirect <a href> links
// and the embedded-checkout iframe host), so hubspot.fetch can reach it
// directly with no new hsmeta changes.
//
// Auth here is the signed `token` query param (see
// common.billing.action_token) — NOT an Authorization header — so this is a
// bare hubspot.fetch, not callHubSpotApi (which always attaches a bearer
// token these endpoints don't expect).
import { hubspot, logger } from "@hubspot/ui-extensions";

// Re-mint a fresh { portal, checkout, upgrade } token set from a still-valid
// one. See billing.py's /v1/billing/refresh-tokens: it verifies `token`
// (whichever action it authorizes — BillingTab always holds/passes `portal`)
// and returns a brand-new set signed for the same app_key/portal_id. Throws
// on a 401 (token already expired) — the caller's next /v1/home load is the
// recovery path for that, same as before this refresh loop existed.
export async function refreshBillingActionTokens(billingBaseUrl, token) {
  const url = `${billingBaseUrl}/v1/billing/refresh-tokens?token=${encodeURIComponent(token)}`;
  const response = await hubspot.fetch(url, { timeout: 10000, method: "GET" });
  if (!response.ok) {
    logger.warn(`[Billing] refresh-tokens failed: ${response.status}`);
    throw new Error(`refresh-tokens failed with status ${response.status}`);
  }
  return response.json();
}
