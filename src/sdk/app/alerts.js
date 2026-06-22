// getAlerts / dismissAlert — generic alerts API client.
//
// Two backend shapes share this client:
//   - SELF-HOSTED apps (sparkfly, toast) serve /api/v1/alerts from their OWN
//     service and resolve portalId from the verified token. Default basePath,
//     no portalId needed.
//   - BASE-HOSTED credit apps (line-item, …) serve from the base service at
//     /v1/hubspot/app_pages/{app}/alerts and require ?portalId=. Pass
//     `basePath` + `portalId` to target that route.
//
// Goes through callAppApi, so it inherits the hubspot.fetch rules (object body,
// no custom headers). BASE_URL (the app's own service, or base for base-hosted
// apps) comes from context.variables.
import { callAppApi } from "./base";

const DEFAULT_BASE_PATH = "/api/v1/alerts";

// context: extension context. params: { offset, limit, orderBy, orderDirection,
// filterField, filterValue, basePath, portalId }. basePath defaults to the
// self-hosted /api/v1/alerts; portalId is appended when set (base-hosted apps).
// Returns the backend's alerts response.
export async function getAlerts(context, params = {}) {
  const {
    offset = 0,
    limit = 10,
    orderBy,
    orderDirection,
    filterField,
    filterValue,
    basePath = DEFAULT_BASE_PATH,
    portalId,
  } = params;
  const queryParams = new URLSearchParams();
  queryParams.append("offset", offset);
  queryParams.append("limit", limit);

  if (orderBy) {
    queryParams.append("order_by_field", orderBy);
  }
  if (orderDirection) {
    queryParams.append("order_by_direction", orderDirection);
  }
  if (filterField && filterValue) {
    queryParams.append("filter_field", filterField);
    queryParams.append("filter_value", filterValue);
  }
  if (portalId != null) {
    queryParams.append("portalId", portalId);
  }
  const path = `${basePath}?${queryParams.toString()}`;
  return callAppApi(context, path, "GET");
}

// context, alertId, options: { basePath, portalId }. basePath defaults to the
// self-hosted /api/v1/alerts; portalId is appended when set (base-hosted apps).
export async function dismissAlert(context, alertId, options = {}) {
  const { basePath = DEFAULT_BASE_PATH, portalId } = options;
  const query =
    portalId != null ? `?portalId=${encodeURIComponent(portalId)}` : "";
  const path = `${basePath}/${alertId}/dismiss${query}`;
  return callAppApi(context, path, "POST");
}
