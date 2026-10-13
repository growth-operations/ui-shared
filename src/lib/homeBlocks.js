// Pure resolvers for the Home cockpit blocks added for Andrew's 2026-10
// App Home feedback: the trial banner (three states), the plan-fit signal,
// and the period-over-period credit comparison. Framework-free (no React) so
// the branch math is unit-testable; the components in ../home stay thin.
//
// Everything here degrades gracefully: every block is additive on the
// /v1/home payload, and a resolver returns null (render nothing) whenever
// the fields it needs are absent.
import { daysUntil } from "./format";

// --- Trial banner ----------------------------------------------------------

// Rides under every trial banner (Andrew's exact copy).
export const TRIAL_BANNER_FOOTER = "Need help? info@growthoperationsco.com";

// Resolve the Home trial banner from the credits entitlement arm.
// Returns null (render nothing) for non-credits modes, paid plans (the trial
// is over), pre-install, or a backend that carries no grant clock. Otherwise
// { variant, title, body, footer } — copy verbatim from Andrew, with the app
// display name templated in.
//
// State selection (first match wins):
//   out of credits  — the free grant is spent (depleted / remaining <= 0).
//                     Beats the clock: a burned-through grant is "out of
//                     credits" even with days left.
//   trial ended     — the grant's 30-day clock ran out with credits left.
//   trial active    — the clock is still running: "[XX] trial days remaining".
export function resolveTrialBanner(entitlement, { appName } = {}) {
  const ent = entitlement;
  if (!ent || ent.mode !== "credits") return null;
  if (ent.plan) return null; // a paid plan is past the trial
  if (ent.status === "not_installed") return null;
  const name = appName ?? "this app";

  const granted = ent.granted ?? 0;
  const used = ent.used ?? 0;
  const remaining = ent.remaining ?? Math.max(granted - used, 0);
  const daysLeft =
    ent.grant_expires_at != null ? daysUntil(ent.grant_expires_at) : null;

  if (ent.depleted === true || remaining <= 0) {
    return {
      variant: "error",
      title: "You're out of credits",
      body: `You have used ${used}/${granted} free credits. Select one of the plans below to continue use of ${name}.`,
      footer: TRIAL_BANNER_FOOTER,
    };
  }
  if (daysLeft != null && daysLeft <= 0) {
    return {
      variant: "warning",
      title: "Your trial has ended",
      body: `Your free trial has ended. Select a plan to continue use of ${name}.`,
      footer: TRIAL_BANNER_FOOTER,
    };
  }
  if (daysLeft != null) {
    return {
      variant: "info",
      title: `${daysLeft} trial days remaining`,
      body: `You have ${daysLeft} days remaining in your trial period. Select a plan to continue use of ${name}.`,
      footer: TRIAL_BANNER_FOOTER,
    };
  }
  // No grant clock on record (a backend that predates grant_expires_at) —
  // nothing to count down, so no banner.
  return null;
}

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

// Resolve the period_comparison block (null until the install has one full
// closed period) into render-ready shape:
//   { last, current, maxTotal } where each period is
//   { label, total, byAction: [{ action, credits }] } and maxTotal is the
//   shared bar denominator (so the two bars are visually comparable; >= 1 so
//   a pair of zero periods never divides by zero).
// Returns null when the block or either period is missing.
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
  return {
    last,
    current,
    maxTotal: Math.max(last.total, current.total, 1),
  };
}

// Same nested-vs-top-level duality as planFitOf: base serves
// payload.state.period_comparison; self-hosted backends MAY go top-level.
export function periodComparisonOf(state) {
  if (!state || typeof state !== "object") return null;
  return resolvePeriodComparison(
    state.state?.period_comparison ?? state.period_comparison
  );
}
