// HubSpot property fetchers/writers for field-mapping pickers.
//
// All calls go through callHubSpotApi with a short-lived token → hubspot.fetch
// rules apply (object body, Authorization-only header). The PATCH body is passed
// as a plain object (NOT JSON.stringify'd).
import { buildHubSpotUrl, callHubSpotApi } from "./base";
import { buildPropertyName } from "../../lib/urls";

// List the writable properties for a HubSpot object type, shaped for a mapping
// picker: [{ name, label, type }] sorted by label. Excludes hidden, archived,
// calculated, and read-only-value properties (a custom mapping can't write to a
// calculated/read-only property).
//
// objectType: the HubSpot CRM object type used in the API path, e.g. "contacts",
// "orders", "line_items", "products", or a custom object's fully-qualified id.
export async function getObjectProperties(context, token, objectType) {
  if (!objectType) return [];
  const url = buildHubSpotUrl(`crm/v3/properties/${objectType}`);
  const response = await callHubSpotApi(url, token);
  return (response.results || [])
    .filter(
      (prop) =>
        !prop.hidden &&
        !prop.archived &&
        !prop.calculated &&
        !prop.modificationMetadata?.readOnlyValue
    )
    .map((prop) => ({
      name: prop.name,
      label: prop.label || prop.name,
      type: prop.type,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Raw property list for an object type (unfiltered) — when you need the full
// HubSpot response rather than the picker-shaped subset.
export async function getProperties(context, token, objectType) {
  const url = buildHubSpotUrl(`crm/v3/properties/${objectType}`);
  return callHubSpotApi(url, token, "GET");
}

// PATCH properties onto the current CRM record (CRM-card context only — relies
// on context.crm.objectTypeId / context.crm.objectId).
export async function updateProperties(context, token, properties) {
  const url = buildHubSpotUrl(
    `crm/v3/objects/${context.crm.objectTypeId}/${context.crm.objectId}`
  );
  // properties is wrapped in a plain object — callHubSpotApi sends it as-is.
  return callHubSpotApi(url, token, "PATCH", { properties });
}

// The enumeration options for a single property, shaped for a
// Select/MultiSelect/checkbox-list picker: [{ label, value }]. Returns [] if
// the property doesn't exist or isn't an enumeration (no `options` array).
//
// App-object properties defined in a *-hsmeta.json (e.g. an app-object's
// `status`) are integrator-defined and land PREFIXED (a{app_id}_status), not
// bare, once installed — pass appPrefix (from context.extension.appId) and
// this checks the prefixed name first, falling back to bare for properties
// that aren't app-namespaced. Omit appPrefix for object types with no app
// prefix at all (e.g. standard objects like contacts).
export async function getPropertyOptions(context, token, objectType, propertyName, appPrefix) {
  const response = await getProperties(context, token, objectType);
  const prefixedName = appPrefix ? buildPropertyName(appPrefix, propertyName) : null;
  const prop = (response.results || []).find(
    (p) => (prefixedName && p.name === prefixedName) || p.name === propertyName
  );
  return (prop?.options || []).map((o) => ({ label: o.label, value: o.value }));
}
