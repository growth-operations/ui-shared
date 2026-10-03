// Top-up ("bank") billing endpoints — the base service's app-agnostic
// /v1/hubspot/app_pages/{app}/billing/* routes (verify_hubspot; the platform
// injects Authorization, so like every callAppApi caller we send NO custom
// headers). Base-hosted credit apps reach base at context.variables.BASE_URL;
// `portalId` rides as a query param — the same pattern as the base-hosted
// alerts routes (see ./alerts).
import { callAppApi } from "./base";

function billingPath(appKey, suffix, portalId, { token } = {}) {
  const path = `/v1/hubspot/app_pages/${encodeURIComponent(appKey)}/billing/${suffix}`;
  const params = new URLSearchParams();
  if (portalId != null) params.append("portalId", portalId);
  if (token != null) params.append("token", token);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

// GET /v1/hubspot/app_pages/{app}/billing/top-ups ->
//   { top_ups: [{ at, credits, price_cents, period_key }] }  (newest first)
// verify_hubspot only — no billing action token needed.
export async function getTopUps(context, { appKey, portalId } = {}) {
  return callAppApi(context, billingPath(appKey, "top-ups", portalId), "GET");
}

// POST /v1/hubspot/app_pages/{app}/billing/limit, body { limit_cents: int|null }
// — set (or clear, with null) the per-period auto top-up spend cap. Body is a
// plain object, never JSON.stringify'd (the hubspot.fetch rule callAppApi
// enforces).
//
// The POST has a SECOND auth dep beyond verify_hubspot: a billing action
// token (common.billing.action_token) as a REQUIRED `token` query param —
// the same "recent, in-app access to THIS app's billing surface for THIS
// portal" proof the billing service's /v1/billing/*/start endpoints require
// (blocks the bare-portal_id hijack vector). Pass a fresh
// state.billing_action_tokens.portal (any action in the vocabulary verifies);
// BillingTab re-mints the set on an interval so a long-open tab never hands
// over an expired one.
export async function setBillingLimit(
  context,
  { appKey, portalId, limitCents, token } = {}
) {
  return callAppApi(
    context,
    billingPath(appKey, "limit", portalId, { token }),
    "POST",
    { limit_cents: limitCents ?? null }
  );
}
