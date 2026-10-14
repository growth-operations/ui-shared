// Pure resolvers for the Home cockpit blocks added for Andrew's 2026-10
// App Home feedback: the plan-fit signal and the period-over-period credit
// comparison. Framework-free (no React) so the branch math is unit-testable;
// the components in ../home stay thin.
//
// (The trial banner used to live here. Andrew 2026-10-13: ONE banner at the
// top of every page — the trial states moved into resolveBillingBanner in
// ./creditDisplay, copy verbatim, and the Home-mounted <TrialBanner> is
// retired.)
//
// Everything here degrades gracefully: every block is additive on the
// /v1/home payload, and a resolver returns null (render nothing) whenever
// the fields it needs are absent.

// --- Plan fit ---------------------------------------------------------------

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "$40/mo" from a dollar number; whole amounts drop the decimals.
const fmtSavings = (usd) =>
  `$${Number.isInteger(usd) ? usd : usd.toFixed(2)}/mo`;

// Resolve the plan_fit block. Returns:
//   null                          — block absent/unknown verdict (render nothing)
//   { kind: "right_plan" }        — reinforces the healthy hero
//   { kind: "upgrade_recommended", text } — the savings banner body, Andrew's
//     copy with the tier/savings/pack count templated in; degrades to a
//     plainer sentence when the backend can't price the savings yet.
export function resolvePlanFit(planFit) {
  if (!planFit || typeof planFit !== "object") return null;

  if (planFit.verdict === "right_plan") {
    return { kind: "right_plan" };
  }

  if (planFit.verdict === "upgrade_recommended") {
    const tier =
      typeof planFit.target_tier === "string" && planFit.target_tier
        ? capitalize(planFit.target_tier)
        : null;
    const savings =
      typeof planFit.monthly_savings_usd === "number"
        ? fmtSavings(planFit.monthly_savings_usd)
        : null;
    const packs = planFit.topup_packs_this_period ?? 0;
    const packsText = `${packs} additional credit pack${packs === 1 ? "" : "s"}`;

    let text;
    if (savings && tier) {
      text = `You could save ${savings} by moving to ${tier} — you bought ${packsText} this period.`;
    } else if (tier) {
      text = `You could save by moving to ${tier} — you bought ${packsText} this period.`;
    } else {
      text = `A higher plan may cost you less — you bought ${packsText} this period.`;
    }
    return { kind: "upgrade_recommended", text };
  }

  return null;
}

// The plan_fit block lives at payload.state.plan_fit on base-hosted backends;
// a self-hosted backend MAY emit it top-level instead. Dual-read (nested
// wins), same as featureUsageOf — without this the banner/hero line silently
// never render (shipped dead 2026-10-12, found 2026-10-13).
export function planFitOf(state) {
  if (!state || typeof state !== "object") return null;
  return resolvePlanFit(state.state?.plan_fit ?? state.plan_fit);
}

// --- Period comparison ------------------------------------------------------

// The stacked chart's slice palette, in assignment order. HubSpot's chart
// `colors` map takes NAMED palette colors only (hex values are not in the
// ChartColor union). "Other" — the server-side fold of every slice past the
// top 7 — is pinned to darkOrange so folding never reshuffles the named
// slices' colors.
const CHART_PALETTE = ["orange", "aqua", "purple", "yellow", "pink", "blue", "green"];
const OTHER_SLICE = "Other";
const OTHER_SLICE_COLOR = "darkOrange";

// The chart payload off the additive `periods` key (2–3 billing-period
// windows, oldest → newest, friendly slice names). Returns:
//   { rows, colors, labels, caption }
// rows    — long-format [{period, feature, credits}], period-major
//           oldest→newest, ready for BarChart's category x-axis. A zero-usage
//           period contributes ONE 0-credit row so its bar renders empty
//           instead of the category collapsing off the x-axis; the filler
//           borrows the first named slice so the legend gains no phantom
//           entry.
// colors  — {featureName: paletteColor} over the alphabetical union of slice
//           names across ALL periods (the same feature keeps its color across
//           bars); "Other" pinned to darkOrange.
// caption — the per-period totals line ("Sep 1 – Sep 30: 210 credits · …")
//           preserving what the legacy progress bars showed.
// Returns null for a missing/malformed `periods` (the caller falls back to
// the legacy two-column rendering).
function resolvePeriodsChart(periods) {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const normd = [];
  for (const p of periods) {
    if (!p || typeof p !== "object" || typeof p.label !== "string") return null;
    const slices = Array.isArray(p.by_action)
      ? p.by_action
          .filter((a) => a && (a.name ?? a.action) != null)
          .map((a) => ({ name: a.name ?? a.action, credits: a.credits ?? 0 }))
      : [];
    normd.push({ label: p.label, total: p.total_credits ?? 0, slices });
  }

  const names = new Set();
  normd.forEach((p) => p.slices.forEach((s) => names.add(s.name)));
  const sorted = [...names].filter((n) => n !== OTHER_SLICE).sort();
  const colors = {};
  sorted.forEach((n, i) => {
    colors[n] = CHART_PALETTE[i % CHART_PALETTE.length];
  });
  colors[OTHER_SLICE] = OTHER_SLICE_COLOR;

  const filler = sorted[0] ?? OTHER_SLICE;
  const rows = [];
  normd.forEach((p) => {
    if (p.slices.length === 0) {
      rows.push({ period: p.label, feature: filler, credits: 0 });
    } else {
      p.slices.forEach((s) =>
        rows.push({ period: p.label, feature: s.name, credits: s.credits })
      );
    }
  });

  const caption = normd
    .map((p) => `${p.label}: ${p.total} ${p.total === 1 ? "credit" : "credits"}`)
    .join(" · ");
  return { rows, colors, labels: normd.map((p) => p.label), caption };
}

// Resolve the period_comparison block (null until the install has one full
// closed period) into render-ready shape. Discriminated on `kind`:
//   { kind: "periods", chart, last, current, maxTotal } — the backend shipped
//     the additive `periods` chart payload; render the stacked BarChart.
//   { kind: "legacy", last, current, maxTotal } — pre-periods backend; render
//     the two-column progress-bar layout.
// `last` / `current` are { label, total, byAction: [{ action, credits }] }
// and maxTotal the shared bar denominator (>= 1 so a pair of zero periods
// never divides by zero). Returns null when the block or either legacy period
// is missing.
export function resolvePeriodComparison(periodComparison) {
  if (!periodComparison || typeof periodComparison !== "object") return null;
  const norm = (p) => {
    if (!p || typeof p !== "object") return null;
    return {
      label: p.label ?? "",
      total: p.total_credits ?? 0,
      byAction: Array.isArray(p.by_action)
        ? p.by_action.filter((a) => a && a.action != null)
        : [],
    };
  };
  const last = norm(periodComparison.last_period);
  const current = norm(periodComparison.current_period);
  if (!last || !current) return null;
  const base = {
    last,
    current,
    maxTotal: Math.max(last.total, current.total, 1),
  };
  const chart = resolvePeriodsChart(periodComparison.periods);
  if (!chart) return { kind: "legacy", ...base };
  return { kind: "periods", chart, ...base };
}

// Same nested-vs-top-level duality as planFitOf: base serves
// payload.state.period_comparison; self-hosted backends MAY go top-level.
export function periodComparisonOf(state) {
  if (!state || typeof state !== "object") return null;
  return resolvePeriodComparison(
    state.state?.period_comparison ?? state.period_comparison
  );
}
