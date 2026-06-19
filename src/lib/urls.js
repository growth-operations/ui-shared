// Shared HubSpot URL builders for Growth Operations app UIs.
// Framework-agnostic (no React) — every app links out to HubSpot records,
// properties, and lists from the same app.hubspot.com URL shapes, so these are
// generic. Centralized here so a HubSpot URL-format change is fixed once.

const APP = "https://app.hubspot.com";

// A contact record. (Contacts are object type 0-1; see buildRecordUrl for the
// generic form.)
export function buildContactUrl(portalId, contactId) {
  return `${APP}/contacts/${portalId}/contact/${contactId}`;
}

// Any CRM record by object type id (e.g. "0-1" contacts, a custom object id).
export function buildRecordUrl(portalId, objectTypeId, recordId) {
  return `${APP}/contacts/${portalId}/record/${objectTypeId}/${recordId}`;
}

// A custom object's "all records" list view.
export function buildObjectListUrl(portalId, objectTypeId) {
  return `${APP}/contacts/${portalId}/objects/${objectTypeId}/views/all/list`;
}

// The contact-list creation screen.
export function buildContactListCreateUrl(portalId) {
  return `${APP}/contacts/${portalId}/objectLists/create`;
}

// A specific contact list's filter editor.
export function buildContactListEditUrl(portalId, listId) {
  return `${APP}/contacts/${portalId}/objectLists/${listId}/filters`;
}

// A form's editor.
export function buildFormEditorUrl(portalId, formId) {
  return `${APP}/forms/${portalId}/editor/${formId}/edit/form`;
}

// A property's settings/edit screen. objectTypeId defaults to contacts ("0-1").
export function buildPropertySettingsUrl(portalId, propertyName, objectTypeId = "0-1") {
  return `${APP}/property-settings/${portalId}/properties?type=${objectTypeId}&action=edit&property=${propertyName}`;
}

// Prefix a property name with an app prefix (e.g. "a12005537"). No-op without a
// prefix. Useful when reading/writing app-namespaced custom properties.
export function buildPropertyName(appPrefix, propertyName) {
  if (!appPrefix) return propertyName;
  return `${appPrefix}_${propertyName}`;
}

export function buildPropertyNames(appPrefix, propertyNames = []) {
  return propertyNames.map((name) => buildPropertyName(appPrefix, name));
}
