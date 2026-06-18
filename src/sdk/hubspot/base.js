// callHubSpotApi / buildHubSpotUrl — direct calls to HubSpot's public API.
//
// For calls that go straight to api.hubapi.com using a short-lived OAuth token
// (see ../token/getShortLivedToken), rather than through the app's own backend.
//
// hubspot.fetch rules enforced here:
//   - Authorization: Bearer {token} is the ONE client header hubspot.fetch
//     permits. We send only that.
//   - `payload` is passed as a plain OBJECT. NEVER JSON.stringify it — hubspot.fetch
//     serializes it. (This was a latent bug in some app copies, which did
//     `body: JSON.stringify(payload)` against api.hubapi.com; fixed here.)
import { hubspot, logger } from "@hubspot/ui-extensions";

export class HubSpotApiError extends Error {
  constructor(message, statusCode, responseText) {
    super(message);
    this.statusCode = statusCode;
    this.responseText = responseText;
    this.name = "HubSpotApiError";
  }
}

// url:     full HubSpot URL, build with buildHubSpotUrl()
// token:   short-lived OAuth access token string
// method:  HTTP method (default "GET")
// payload: plain object — NOT a JSON string (see header)
export async function callHubSpotApi(url, token, method = "GET", payload = null) {
  logger.debug(`[HubSpotApi] ${method} ${url}`);

  const response = await hubspot.fetch(url, {
    timeout: 30000,
    method,
    // Authorization is the only permitted client header.
    headers: { Authorization: `Bearer ${token}` },
    // body must be a plain object — hubspot.fetch serializes it. Do NOT
    // JSON.stringify here.
    ...(payload && { body: payload }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[HubSpotApi] Error: ${method} ${url} - Status ${response.status}`);

    // Surface expired-token failures distinctly so callers can refresh + retry.
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.category === "EXPIRED_AUTHENTICATION") {
        logger.warn("[HubSpotApi] Token expired");
        throw new HubSpotApiError("TOKEN_EXPIRED", response.status, errorText);
      }
    } catch (e) {
      if (e instanceof HubSpotApiError) {
        throw e;
      }
      // body wasn't JSON; fall through to the generic error below
    }
    throw new HubSpotApiError(errorText, response.status, errorText);
  }

  return response.json();
}

// Build a HubSpot public API URL from an endpoint path, e.g.
// buildHubSpotUrl("crm/v3/properties/contacts").
export function buildHubSpotUrl(endpoint) {
  return `https://api.hubapi.com/${endpoint}`;
}
