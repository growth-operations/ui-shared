// callAppApi — the single most-reused SDK helper.
//
// Wraps hubspot.fetch for calls to the APP's OWN backend (the Cloud Run service
// behind context.variables.BASE_URL). Use this instead of reimplementing the
// fetch dance in every app.
//
// hubspot.fetch rules enforced here (these bugs have cost real debugging time):
//   - `body` is passed as a plain OBJECT. NEVER JSON.stringify it — hubspot.fetch
//     serializes it for you, and a pre-stringified body is rejected/mangled.
//   - NO custom headers. The platform injects Authorization automatically; adding
//     any other header (Content-Type, etc.) causes hubspot.fetch to reject the
//     request. So this helper sends none.
import { hubspot } from "@hubspot/ui-extensions";

export class AppApiError extends Error {
  constructor(message, statusCode, responseText) {
    super(message);
    this.statusCode = statusCode;
    this.responseText = responseText;
    this.name = "AppApiError";
  }
}

// context: the HubSpot extension context (must expose context.variables.BASE_URL)
// path:    request path appended to BASE_URL, e.g. "/api/v1/settings"
// method:  HTTP method (default "GET")
// body:    plain object — NOT a JSON string (see header)
export async function callAppApi(context, path, method = "GET", body = null) {
  const url = `${context.variables.BASE_URL}${path}`;

  const response = await hubspot.fetch(url, {
    timeout: 30000,
    method,
    // body is a plain object; hubspot.fetch serializes it. No custom headers —
    // Authorization is injected by the platform.
    ...(body && { body }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // FastAPI errors come back as {"detail": "..."} — surface just the detail
    // string so callers can show it directly in the UI without dragging the
    // JSON wrapper into the message.
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed && typeof parsed.detail === "string") {
        message = parsed.detail;
      }
    } catch {
      // body wasn't JSON; keep the raw text
    }
    throw new AppApiError(message, response.status, errorText);
  }

  return response.json();
}
