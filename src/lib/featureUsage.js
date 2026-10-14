// Pure resolver for the Home "Most used features" / "Recommended to explore"
// sections, fed by the additive `feature_usage` block on the /home payload
// (growth-ops-apps-base computes it from the credit ledger). Framework-free
// (no React) so the branch math is unit-testable; ../home/FeatureUsage.jsx
// stays thin.
//
// Degrades gracefully by contract: the block is ABSENT on older backends,
// on legacy (Anvil) installs, and on apps with no feature registry — every
// one of those resolves to null (render nothing), never an empty box.

// The wire field is `credits_or_events`: the registry anticipates
// event-denominated features, so a most_used row MAY carry a `unit` hint
// ("credits" | "events"; singular spellings accepted). Absent -> "credits",
// which is what every current backend emits.
const normalizeUnit = (u) =>
  typeof u === "string" && u.toLowerCase().startsWith("event") ? "events" : "credits";

// One well-formed setup CTA is {label: non-empty string, url XOR route:
// non-empty string}. Anything else (missing label, both targets, neither
// target, wrong types) is dropped — a malformed item never renders.
const normalizeCta = (c) => {
  if (!c || typeof c !== "object") return null;
  const label = typeof c.label === "string" && c.label ? c.label : null;
  const url = typeof c.url === "string" && c.url ? c.url : null;
  const route = typeof c.route === "string" && c.route ? c.route : null;
  if (!label || !(url || route) || (url && route)) return null;
  return url ? { label, url } : { label, route };
};

// Resolve the feature_usage block into render-ready shape:
//   { mostUsed: [{ key, name, count, unit }],
//     notInUse: [{ key, name, docsUrl, rationale, ctas }] }
// Returns null when the block is absent/malformed or BOTH lists are empty
// (an install using every detectable feature has nothing to show here).
export function resolveFeatureUsage(featureUsage) {
  if (!featureUsage || typeof featureUsage !== "object") return null;

  const mostUsed = (Array.isArray(featureUsage.most_used) ? featureUsage.most_used : [])
    .filter((f) => f && f.key != null && f.name)
    .map((f) => ({
      key: f.key,
      name: f.name,
      count: typeof f.credits_or_events === "number" ? f.credits_or_events : 0,
      unit: normalizeUnit(f.unit),
    }));

  const notInUse = (Array.isArray(featureUsage.not_in_use) ? featureUsage.not_in_use : [])
    .filter((f) => f && f.key != null && f.name)
    .map((f) => ({
      key: f.key,
      name: f.name,
      docsUrl: typeof f.docs_url === "string" && f.docs_url ? f.docs_url : null,
      rationale: typeof f.rationale === "string" ? f.rationale : "",
      // Optional SETUP actions (1.26.0 — a LIST per feature: one feature can
      // surface in multiple places, e.g. a card on both contacts and
      // applications). Each item is {label, url|route}; absent/empty -> [].
      ctas: (Array.isArray(f.ctas) ? f.ctas : []).map(normalizeCta).filter(Boolean),
    }));

  if (mostUsed.length === 0 && notInUse.length === 0) return null;
  return { mostUsed, notInUse };
}

// The block lives at payload.state.feature_usage on current backends. The
// bare `payload.feature_usage` fallback keeps the component working if a
// host ever passes the inner state block instead of the whole payload.
export function featureUsageOf(state) {
  if (!state || typeof state !== "object") return null;
  return resolveFeatureUsage(state.state?.feature_usage ?? state.feature_usage);
}

// --- Recommendation rotation ------------------------------------------------

// A long not_in_use list is a firehose: a fresh install of a big app (ATS
// has 13 registered features) gets the whole registry dumped on Home exactly
// when focus matters most, and a wall of 13 "Read the guide" links teaches
// nothing. So short lists (<= RECOMMENDATION_WHOLE_LIST_MAX) render whole;
// longer lists show a deterministic daily slice that rotates day over day.
// The seed is the UTC date alone — same picks all day, no per-portal state,
// no backend involvement (the full list still arrives in the payload).
export const RECOMMENDATION_PICK_COUNT = 3;
export const RECOMMENDATION_WHOLE_LIST_MAX = 4;

// djb2 over the date string — tiny, stable across browsers, good enough for
// a day offset (not a security or money decision).
export function rotationDayHash(dateISO) {
  let h = 5381;
  for (let i = 0; i < dateISO.length; i++) {
    h = ((h << 5) + h + dateISO.charCodeAt(i)) >>> 0;
  }
  return h;
}

// The slice to render for `todayISO` ("YYYY-MM-DD", UTC). Order within the
// day stays registry order; the window wraps around the end of the list.
// Pure + date-injected so tests don't depend on the wall clock.
export function pickDailyRecommendations(notInUse, todayISO) {
  if (!Array.isArray(notInUse)) return [];
  if (notInUse.length <= RECOMMENDATION_WHOLE_LIST_MAX) return notInUse;
  const start = rotationDayHash(todayISO) % notInUse.length;
  return Array.from(
    { length: RECOMMENDATION_PICK_COUNT },
    (_, i) => notInUse[(start + i) % notInUse.length]
  );
}

// True when rotation truncated the list — the tile shows a quiet "new picks
// daily" hint only then, so small registries read exactly as before.
export function recommendationsRotated(notInUse) {
  return Array.isArray(notInUse) && notInUse.length > RECOMMENDATION_WHOLE_LIST_MAX;
}
