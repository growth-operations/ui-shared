// getShortLivedToken — fetch a short-lived HubSpot OAuth token from the app
// backend for the current portal.
//
// Hits GET /api/v1/tokens/short-lived?portalId=... via callAppApi (so the
// hubspot.fetch rules are handled there). Returns the bare token string; the
// backend's Token model exposes the access token as `token` (aliased), with
// access_token as a fallback for safety.
import { callAppApi } from "../app/base";

export async function getShortLivedToken(context) {
  const portalId = context?.portal?.id;
  const query = portalId ? `?portalId=${portalId}` : "";
  const result = await callAppApi(
    context,
    `/api/v1/tokens/short-lived${query}`,
    "GET"
  );
  return result.token || result.access_token;
}

// Is a token-data object (with an `expires_at` epoch-seconds field) past expiry?
export function isTokenExpired(tokenData) {
  return Date.now() / 1000 > tokenData.expires_at;
}
