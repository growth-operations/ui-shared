// Pure resolver for the Home "Most used features" / "Recommended to explore"
// sections, fed by the additive `feature_usage` block on the /home payload
// (growth-ops-apps-base computes it from the credit ledger). Framework-free
// (no React) so the branch math is unit-testable; ../home/FeatureUsage.jsx
// stays thin.
//
// Degrades gracefully by contract: the block is ABSENT on older backends,
// on legacy (Anvil) installs, and on apps with no feature registry — every
// one of those resolves to null (render nothing), never an empty box.

// Resolve the feature_usage block into render-ready shape:
//   { mostUsed: [{ key, name, creditsLabel }],
//     notInUse: [{ key, name, docsUrl, rationale }] }
// Returns null when the block is absent/malformed or BOTH lists are empty
// (an install using every detectable feature has nothing to show here).
export function resolveFeatureUsage(featureUsage) {
  if (!featureUsage || typeof featureUsage !== "object") return null;

  const mostUsed = (Array.isArray(featureUsage.most_used) ? featureUsage.most_used : [])
    .filter((f) => f && f.key != null && f.name)
    .map((f) => ({
      key: f.key,
      name: f.name,
      credits: typeof f.credits_or_events === "number" ? f.credits_or_events : 0,
    }));

  const notInUse = (Array.isArray(featureUsage.not_in_use) ? featureUsage.not_in_use : [])
    .filter((f) => f && f.key != null && f.name)
    .map((f) => ({
      key: f.key,
      name: f.name,
      docsUrl: typeof f.docs_url === "string" && f.docs_url ? f.docs_url : null,
      rationale: typeof f.rationale === "string" ? f.rationale : "",
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
