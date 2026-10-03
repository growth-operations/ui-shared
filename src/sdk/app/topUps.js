// Top-up ("bank") billing endpoints — the base service's app-agnostic
// /v1/hubspot/app_pages/{app}/billing/* routes (verify_hubspot; the platform
// injects Authorization, so like every callAppApi caller we send NO custom
// headers). Base-hosted credit apps reach base at context.variables.BASE_URL;
// `portalId` rides as a query param — the same pattern as the base-hosted
// alerts routes (see ./alerts).
import { callAppApi } from "./base";

function billingPath(appKey, suffix, portalId) {
  const path = `/v1/hubspot/app_pages/${encodeURIComponent(appKey)}/billing/${suffix}`;
  return portalId != null
    ? `${path}?portalId=${encodeURIComponent(portalId)}`
    : path;
}

// GET /v1/hubspot/app_pages/{app}/billing/top-ups ->
//   { top_ups: [{ at, credits, price_cents, period_key }] }  (newest first)
export async function getTopUps(context, { appKey, portalId } = {}) {
  return callAppApi(context, billingPath(appKey, "top-ups", portalId), "GET");
}

// POST /v1/hubspot/app_pages/{app}/billing/limit, body { limit_cents: int|null }
// — set (or clear, with null) the per-period auto top-up spend cap. Body is a
// plain object, never JSON.stringify'd (the hubspot.fetch rule callAppApi
// enforces).
export async function setBillingLimit(context, { appKey, portalId, limitCents } = {}) {
  return callAppApi(context, billingPath(appKey, "limit", portalId), "POST", {
    limit_cents: limitCents ?? null,
  });
}
