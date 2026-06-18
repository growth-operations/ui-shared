// Settings API client with a module-level cache.
//
// Two ways to use this:
//   1. The default getSettings/updateSettings exports — hit /api/v1/settings and
//      share one module-level cache. Good for the common case.
//   2. makeSettingsApi({ path }) — build an isolated client with its own cache,
//      for apps whose settings live at a different path, or that want a cache not
//      shared with other importers.
//
// getSettings accepts { force } to bypass the cache (e.g. polling for live sync
// status, which a stale cache would otherwise mask). `force` bypasses BOTH the
// frontend module cache AND the backend account cache: it appends ?fresh=1 so a
// backend that honors it (e.g. toast's CacheableMixin-backed /settings) reads
// live state instead of its own ~120s-cached copy. updateSettings invalidates
// the cache on write.
//
// All requests go through callAppApi → hubspot.fetch rules apply (object body,
// no custom headers).
import { callAppApi } from "./base";

// Build an isolated settings client with its own module-level cache.
// path: backend settings endpoint (default "/api/v1/settings").
export function makeSettingsApi({ path = "/api/v1/settings" } = {}) {
  let cachedSettings = null;
  let settingsPromise = null;

  async function getSettings(context, { force = false } = {}) {
    // Return cached settings if available — unless the caller forces a fresh
    // read (the cache would otherwise mask live changes).
    if (!force && cachedSettings) {
      return cachedSettings;
    }

    // Return existing in-flight fetch (don't share it with a forced read).
    if (!force && settingsPromise) {
      return settingsPromise;
    }

    // On a forced read, also ask the backend to bypass its own cache (?fresh=1)
    // so we don't just re-fetch a server-side-stale copy.
    const reqPath = force
      ? `${path}${path.includes("?") ? "&" : "?"}fresh=1`
      : path;
    const fetchPromise = (async () => {
      try {
        const settings = await callAppApi(context, reqPath, "GET");
        cachedSettings = settings;
        settingsPromise = null;
        return settings;
      } catch (error) {
        settingsPromise = null;
        throw error;
      }
    })();

    if (!force) settingsPromise = fetchPromise;
    return fetchPromise;
  }

  async function updateSettings(context, settings) {
    const result = await callAppApi(context, path, "PUT", settings);
    // Invalidate cache when settings are updated.
    cachedSettings = null;
    return result;
  }

  return { getSettings, updateSettings };
}

// Default client at /api/v1/settings.
const defaultSettingsApi = makeSettingsApi();
export const getSettings = defaultSettingsApi.getSettings;
export const updateSettings = defaultSettingsApi.updateSettings;
