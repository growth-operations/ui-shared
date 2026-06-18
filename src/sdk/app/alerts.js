// getAlerts / dismissAlert — generic alerts API client.
//
// Every Growth Ops app exposes the same /api/v1/alerts surface (paginated,
// orderable, filterable). This is already app-agnostic, so it's ported verbatim.
// Goes through callAppApi, so it inherits the hubspot.fetch rules (object body,
// no custom headers).
import { callAppApi } from "./base";

// context: extension context. params: { offset, limit, orderBy, orderDirection,
// filterField, filterValue }. Returns the backend's alerts response.
export async function getAlerts(context, params = {}) {
  const {
    offset = 0,
    limit = 10,
    orderBy,
    orderDirection,
    filterField,
    filterValue,
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
  const path = `/api/v1/alerts?${queryParams.toString()}`;
  return callAppApi(context, path, "GET");
}

export async function dismissAlert(context, alertId) {
  const path = `/api/v1/alerts/${alertId}/dismiss`;
  return callAppApi(context, path, "POST");
}
