// Pure display logic for the credits archetype's top-up ("bank") model —
// framework-free (no React) so the branches are unit-testable and the
// components stay thin. Source of truth for the semantics:
// common.entitlements.credits.CreditState.to_entitlement.
//
// THE MODEL IN BRIEF
//   Credit apps get two buckets: a monthly pool (resets each billing period,
//   no rollover) and a never-expiring prepaid top-up bank that draws down
//   ONLY after the pool. Under the "topup" billing model the entitlement
//   arm's granted/used/remaining are a COMBINED display:
//     granted   = period pool + bank remaining
//     remaining = pool remaining + bank remaining
//     used      = granted - remaining   (the current-position marker)
//   so after a period reset with bank left the meter reads e.g. "0 of 1,700".
//   Metered-model (legacy) paid accounts keep the RAW display (used grows
//   past granted as overage) and only ever see threshold_state
//   "healthy"/"depleted" with top_up_bank_remaining 0.
//
// BLOCKING (replaces the old "a paid plan is NEVER blocked" assumption):
//   threshold_state === "depleted" is the ONLY hard-blocked state — a
//   topup-model PAID plan DOES block at true zero (pool + bank empty, no
//   successful top-up). A metered paid account in overage is NOT blocked:
//   `over_included` always wins over a depleted reading (the backend mirrors
//   this — metered overage keeps threshold_state "healthy" — and the UI
//   double-guards so a stale/mixed payload can't regress the 2026-09-02
//   incident where a paying, overage account was shown a blocking
//   "Depleted"/"out of credits" panel).
import { daysUntil, SUPPORT_FOOTER } from "./format";

// True when the account has (or ever had) a top-up bank. Note the CreditMeter
// bank section renders only while the bank HAS credits left (bankRemaining >
// 0 — see resolveCreditMeter); this predicate stays the looser "ever had one"
// for consumers that render history/summary surfaces.
export function hasTopUpBank(ent) {
  if (!ent) return false;
  return (ent.top_up_bank_remaining ?? 0) > 0 || ent.last_top_up_at != null;
}

// Resolve every CreditMeter display decision from the /v1/home payload.
// Returns null when there is no credit data to show (component renders
// nothing). Otherwise:
//   granted/used/remaining — combined (topup) or raw (legacy) display numbers
//   bank                 — { bankRemaining, bankGranted, poolGrant,
//                          poolRemaining, poolUsed } when the account has bank
//                          credits LEFT (bankRemaining > 0), else null — a
//                          zero bank renders the plain single-pool bar (with
//                          bankRemaining 0 the combined numbers ARE the pool
//                          numbers). bankGranted is the bank's lifetime
//                          granted total (the bank bar's denominator); 0 on
//                          backends that predate top_up_bank_granted — the
//                          component degrades to a text-only bank line.
//   thresholdState       — the arm's threshold_state, or null on a backend
//                          that predates it
//   depleted/overIncluded/low — mutually-exclusive urgency flags
//   tagVariant/tagLabel  — StatusTag rendering (ACCOUNT state — unchanged)
//   poolBarVariant       — ProgressBar sentiment for the pool bar (and the
//                          no-bank legacy single bar), colored by the POOL'S
//                          OWN fill level, not the account state
//   bankBarVariant       — same for the bank level gauge (null when there is
//                          no bank section)
//   alert                — { variant, title, message } or null
//   grantExpiresAt       — pass-through for the free-grant countdown
//   renewsOn             — "YYYY-MM-DD" the monthly pool renews on, from the
//                          state.credits block (null when absent)
//
// BAR COLORS ARE PER-BAR FILL LEVELS (Jasper 2026-10): a pool at 99% used
// with a full bank must NOT render green just because the account is healthy
// — each bar colors by its own level; the StatusTag keeps the account-state
// colors. The pool bar colors on % CONSUMED (Andrew 2026-10: green under
// 50%, orange 50–80%, red over 80%). Comparisons are integer
// cross-multiplications — no float fuzz at the 50/80/20 boundaries.
//
// THE state.credits BLOCK (2026-10 contract addition): when the payload
// carries `credits` ({ monthly: { remaining, included, renews_on },
// additional: { remaining, purchased, expires } }) it is AUTHORITATIVE for
// the two-bucket display — no deriving pool/bank from the entitlement's
// combined numbers. Absent (older backends) -> the legacy entitlement
// derivation below, unchanged.
//
//   pool (DEPLETION meter, value = poolUsed of poolGrant), colored on %
//     consumed per Andrew's 2026-10 feedback: success under 50% used, warning
//     from 50% through 80%, danger over 80%.
//   bank (LEVEL gauge, value = bankRemaining of bankGranted):
//     success above 50% full, warning at <= 50%. NO danger variant:
//     HubSpot's ProgressBar paints the WHOLE TRACK red in danger (not just
//     the filled portion), so a low level gauge would read as a full bar
//     (caught in Jasper's 2026-10-04 screenshot review). Urgency at <= 20%
//     rides the "Running low" tag (bank.bankLow) instead of the bar color.
//     danger stays on the pool bar, where near-full is the truth.
function poolBarVariantFor(poolUsed, poolGrant) {
  if (!(poolGrant > 0)) return "success"; // no grant: nothing to deplete
  if (poolUsed * 100 > 80 * poolGrant) return "danger";
  if (poolUsed * 100 >= 50 * poolGrant) return "warning";
  return "success";
}

function bankBarVariantFor(bankRemaining, bankGranted) {
  if (!(bankGranted > 0)) return "success"; // degraded text-only line renders no bar
  if (bankRemaining * 100 <= 50 * bankGranted) return "warning";
  return "success";
}
// The credits block lives at payload.state.credits on base-hosted backends; a
// self-hosted backend MAY emit it top-level. Dual-read (nested wins), same as
// featureUsageOf/planFitOf — without this the meter falls back to the legacy
// single-bar path (no monthly/additional split, no "renews on" line).
export function creditsBlockOf(state) {
  if (!state || typeof state !== "object") return null;
  return state.state?.credits ?? state.credits ?? null;
}

export function resolveCreditMeter(entitlement, creditMeter, credits = null) {
  const ent = entitlement?.mode === "credits" ? entitlement : null;
  const meter = creditMeter ?? null;
  // The state.credits block stands on its own (it IS the credit data), so it
  // keeps the meter alive even on a payload whose entitlement arm is missing.
  const creditsBlock =
    credits && (credits.monthly || credits.additional) ? credits : null;
  if (!ent && !meter && !creditsBlock) return null;

  // Number precedence: once the entitlement arm carries the top-up fields it
  // is authoritative — the credit_meter block stays RAW pool-only under the
  // topup model, so reading meter-first would hide the bank. On older
  // backends (no top-up fields) keep the historical meter-first precedence
  // (the meter is the richer block: it carries `recent`).
  const entHasTopUpFields =
    ent != null && typeof ent.top_up_bank_remaining === "number";
  const pick = (key) =>
    entHasTopUpFields ? ent[key] ?? meter?.[key] : meter?.[key] ?? ent?.[key];

  // Number source: the state.credits block when present (authoritative
  // two-bucket numbers), else the entitlement/meter precedence chain.
  let granted;
  let used;
  let remaining;
  if (creditsBlock) {
    const monthly = creditsBlock.monthly ?? {};
    const additional = creditsBlock.additional ?? {};
    const poolGrant = Math.max(0, monthly.included ?? 0);
    const poolRemaining = Math.max(0, monthly.remaining ?? 0);
    const bankRemaining = Math.max(0, additional.remaining ?? 0);
    granted = poolGrant + bankRemaining;
    remaining = poolRemaining + bankRemaining;
    used = Math.max(granted - remaining, 0);
  } else {
    granted = pick("granted") ?? 0;
    used = pick("used") ?? 0;
    remaining = pick("remaining") ?? Math.max(granted - used, 0);
  }

  const onPaidPlan = !!ent?.plan;
  const lowThreshold = ent?.low_threshold ?? 0;
  const thresholdState =
    typeof ent?.threshold_state === "string" ? ent.threshold_state : null;

  const overIncluded =
    onPaidPlan &&
    (ent?.over_included === true || (thresholdState == null && used > granted));
  const depleted =
    thresholdState != null
      ? thresholdState === "depleted" && !overIncluded
      : !onPaidPlan && (ent?.depleted === true || remaining <= 0);
  const low = !depleted && !overIncluded && remaining <= lowThreshold;

  // Bank split. Drawdown is monthly-first, so of the combined `remaining` the
  // bank portion is bankRemaining and the rest is pool remaining; the pool
  // segment's full size is the combined denominator minus the bank.
  //
  // Under the state.credits block the two-bucket layout is ALWAYS in force:
  // the monthly line (+ "Renews on" subline + pool bar) renders even when the
  // account has never bought additional credits; the additional-credits line
  // rides along only when the account has (or ever bought) a bank —
  // purchased > 0 carries the true lifetime total, so a spent bank reads
  // "0 of 1,000 left" instead of disappearing (bank.showAdditional).
  //
  // Under the legacy derivation (no credits block) the bank section renders
  // ONLY while the bank has credits left (bankRemaining > 0): a zero bank —
  // never topped up, or fully burned — renders the plain single-pool bar, and
  // with bankRemaining 0 the combined numbers ARE the pool numbers (granted
  // == poolGrant, remaining == poolRemaining), so nothing is lost.
  let bank = null;
  const bankRemaining = creditsBlock
    ? Math.max(0, creditsBlock.additional?.remaining ?? 0)
    : Math.max(0, ent?.top_up_bank_remaining ?? 0);
  const bankGrantedTotal = creditsBlock
    ? Math.max(0, creditsBlock.additional?.purchased ?? 0)
    : Math.max(0, ent?.top_up_bank_granted ?? 0);
  if (creditsBlock || bankRemaining > 0) {
    const poolGrant = creditsBlock
      ? Math.max(0, creditsBlock.monthly?.included ?? 0)
      : Math.max(granted - bankRemaining, 0);
    const poolRemaining = creditsBlock
      ? Math.min(Math.max(0, creditsBlock.monthly?.remaining ?? 0), poolGrant)
      : Math.min(Math.max(remaining - bankRemaining, 0), poolGrant);
    bank = {
      bankRemaining,
      // The bank's lifetime granted total — the bank bar's denominator. 0 on
      // backends that predate top_up_bank_granted (the component degrades to
      // a text-only bank line; never divide by zero, never "of 0").
      bankGranted: bankGrantedTotal,
      // Whether the additional-credits line renders at all. Legacy path: yes
      // (we only get here with bankRemaining > 0). credits block: only when
      // the account has or bought a bank — otherwise the two-bucket layout is
      // just the monthly line.
      showAdditional: creditsBlock
        ? bankRemaining > 0 || bankGrantedTotal > 0
        : true,
      poolGrant,
      poolRemaining,
      poolUsed: poolGrant - poolRemaining,
    };
    // "Running low" tag at <= 20% of the granted total (the bar itself caps
    // at warning — see the header block). False when the total is unknown.
    bank.bankLow =
      bank.bankGranted > 0 && bankRemaining * 100 <= 20 * bank.bankGranted;
  }

  let tagVariant;
  let tagLabel;
  if (depleted) {
    tagVariant = "danger";
    tagLabel = "Depleted";
  } else if (thresholdState === "top_up_failed") {
    tagVariant = "danger";
    tagLabel = "Couldn't add credits";
  } else if (thresholdState === "limit_reached") {
    tagVariant = "warning";
    tagLabel = "Limit reached";
  } else if (thresholdState === "top_up_pending") {
    tagVariant = "info";
    tagLabel = "Adding credits";
  } else if (overIncluded) {
    tagVariant = "warning";
    tagLabel = "Over included";
  } else if (low) {
    tagVariant = "warning";
    tagLabel = "Running low";
  } else {
    tagVariant = "success";
    tagLabel = "Healthy";
  }

  // ProgressBar sentiments — each bar colored by ITS OWN fill level (see the
  // header block). The pool bar (and the no-bank legacy single bar) reads the
  // pool's depletion ratio; the bank bar reads the bank's remaining level.
  const poolBarVariant = poolBarVariantFor(
    bank ? bank.poolUsed : used,
    bank ? bank.poolGrant : granted
  );
  const bankBarVariant = bank
    ? bankBarVariantFor(bank.bankRemaining, bank.bankGranted)
    : null;

  // The inline meter alert mirrors the banner's messaging at the point of
  // glance. Legacy branches keep their pre-top-up copy byte-for-byte.
  let alert = null;
  if (depleted) {
    alert = {
      variant: "error",
      title: "You're out of credits",
      message: onPaidPlan
        ? "Actions are paused until your plan renews or more credits are added."
        : "Choose a plan to resume your use.",
    };
  } else if (thresholdState === "top_up_failed") {
    alert = {
      variant: "error",
      title: "We couldn't add credits",
      message:
        "The automatic additional-credits purchase failed — update your payment method in Billing.",
    };
  } else if (thresholdState === "limit_reached") {
    alert = {
      variant: "warning",
      title: "Billing limit reached",
      message:
        "Automatic additional-credit purchases are paused at your spending limit for this period. Raise your billing limit in Billing to resume them.",
    };
  } else if (overIncluded) {
    alert = {
      variant: "warning",
      title: "You've used your included credits",
      message:
        "Extra usage this period is billed as overage at your plan's per-credit rate.",
    };
  } else if (low) {
    alert = {
      variant: "warning",
      title: "Running low on credits",
      message:
        "You're getting close to your limit — pick a plan or add more credits.",
    };
  }

  return {
    granted,
    used,
    remaining,
    bank,
    thresholdState,
    depleted,
    overIncluded,
    low,
    tagVariant,
    tagLabel,
    poolBarVariant,
    bankBarVariant,
    alert,
    grantExpiresAt: ent?.grant_expires_at ?? null,
    // "YYYY-MM-DD" the monthly pool renews on (state.credits block only; null
    // on older backends — the component just skips the subline).
    renewsOn: creditsBlock ? (creditsBlock.monthly?.renews_on ?? null) : null,
  };
}

// --- Free-grant trial states (consolidated into the TOP banner) ------------

// Andrew 2026-10-13: ONE banner at the top of every page. Anything that STOPS
// the app — out of credits, trial ended, payment failed — flies RED in the
// top BillingBanner; "trial active" flies YELLOW there too. The separate
// Home-mounted TrialBanner is retired; its copy (approved by the product
// owner) is reused VERBATIM here — only the placement and the trial-ended
// variant (warning -> error: it stops the app) changed.
//
// First match wins inside trialStateOf, mirroring the retired resolver:
//   out of credits  — the free grant is spent (depleted / remaining <= 0).
//                     Beats the clock: a burned-through grant is "out of
//                     credits" even with days left.
//   trial ended     — the grant's 30-day clock ran out with credits left.
//   trial active    — the clock is still running: "[XX] trial days remaining".
// Returns { kind, title, body } or null (no grant clock on record).
function trialStateOf(ent, { appName } = {}) {
  const name = appName ?? "this app";
  const granted = ent.granted ?? 0;
  const used = ent.used ?? 0;
  const remaining = ent.remaining ?? Math.max(granted - used, 0);
  const daysLeft =
    ent.grant_expires_at != null ? daysUntil(ent.grant_expires_at) : null;

  if (ent.depleted === true || remaining <= 0) {
    return {
      kind: "out_of_credits",
      title: "You're out of credits",
      body: `You have used ${used}/${granted} free credits. Select one of the plans below to continue use of ${name}.`,
    };
  }
  if (daysLeft != null && daysLeft <= 0) {
    return {
      kind: "trial_ended",
      title: "Your trial has ended",
      body: `Your free trial has ended. Select a plan to continue use of ${name}.`,
    };
  }
  if (daysLeft != null) {
    return {
      kind: "trial_active",
      title: `${daysLeft} trial days remaining`,
      body: `You have ${daysLeft} days remaining in your trial period. Select a plan to continue use of ${name}.`,
    };
  }
  return null;
}

// Trial states map onto the banner shape with the shared support footer and a
// Billing-tab CTA (the copy asks for a plan; on non-Home pages nothing is
// "below", so the button routes to the picker). out-of-credits/trial-ended
// are RED (they stop the app), trial-active is YELLOW — Andrew 2026-10-13.
const TRIAL_STATE_VARIANT = {
  out_of_credits: "error",
  trial_ended: "error",
  trial_active: "warning",
};

function trialBannerView(trial) {
  return {
    variant: TRIAL_STATE_VARIANT[trial.kind],
    title: trial.title,
    message: trial.body,
    footer: SUPPORT_FOOTER,
    cta: { kind: "billing", label: "Go to Billing →" },
  };
}

// Resolve the app-wide BillingBanner from the credits entitlement arm.
// Returns null to render nothing (non-credits mode, pre-install, or healthy),
// else { variant, title, message, footer?, cta } where cta is null or:
//   { kind: "portal",  label } — link out to the Stripe billing-portal entry
//                                point (payment-method fixes)
//   { kind: "billing", label } — in-app navigate to the Billing tab
//
// Driven by threshold_state for the top-up model; the legacy metered branches
// (free depleted / paid over_included / free running-low) are byte-identical
// to the pre-top-up banner.
//
// Precedence (first match wins):
//   1. top_up_pending  (info)    — transient in-flight top-up
//   2. top_up_failed   (error)   — card on file failed to process
//   3. limit_reached   (warning)
//   4. depleted        (error)   — THE out-of-credits block; existing
//                                  byte-identical copy wins whenever the
//                                  explicit signals (threshold_state /
//                                  depleted flag / entitled=false) fire
//   5. trial out_of_credits (error) — free grant spent WITHOUT the explicit
//                                  signals (remaining <= 0 catch-all)
//   6. trial ended     (error)   — the grant clock ran out with credits left
//   7. over_included   (warning) — paid metered overage (never blocked)
//   8. running low     (warning) — free grant under low_threshold
//   9. trial active    (warning) — the countdown; yields to running-low, the
//                                  more urgent of the two yellow states
export function resolveBillingBanner(entitlement, { actionLabel, actionsNoun, appName } = {}) {
  const ent = entitlement;
  if (!ent || ent.mode !== "credits" || ent.status === "not_installed") {
    return null;
  }

  const onPaidPlan = !!ent.plan;
  const thresholdState =
    typeof ent.threshold_state === "string" ? ent.threshold_state : null;
  const label = actionLabel ?? "going";
  const noun = actionsNoun ?? "actions";

  // --- Top-up (bank) model states. The backend only emits these three for
  // topup-model accounts; each maps to exactly one banner. ---
  if (thresholdState === "top_up_pending") {
    return {
      variant: "info",
      title: "Adding credits automatically",
      message:
        "Your monthly credits ran low, so we're adding more with your payment method on file. Nothing to do — this usually takes a moment.",
      cta: null,
    };
  }
  if (thresholdState === "top_up_failed") {
    return {
      variant: "error",
      title: "We couldn't add credits",
      message: `The automatic additional-credits purchase failed. Update your payment method so your ${noun} aren't interrupted.`,
      cta: { kind: "portal", label: "Update payment method" },
    };
  }
  if (thresholdState === "limit_reached") {
    return {
      variant: "warning",
      title: "Billing limit reached",
      message:
        "Automatic additional-credit purchases are paused — you've hit your spending limit for this billing period. Raise your billing limit to keep them going.",
      cta: { kind: "billing", label: "Raise your billing limit" },
    };
  }

  // The free-grant trial states (null for paid plans — a paid plan is past
  // the trial). Computed BEFORE the depleted branch: a lapsed trial clock
  // explains a legacy `entitled: false` reading better than "out of credits"
  // (credits remain; the GRANT expired), so trial_ended wins over that one
  // legacy signal below — but never over an explicit depleted flag or
  // threshold_state "depleted".
  const trial = onPaidPlan ? null : trialStateOf(ent, { appName });

  // --- Hard-blocked. threshold_state "depleted" is the ONLY blocking state
  // (a topup-model paid plan blocks at true zero); `over_included` overrides
  // a depleted reading so a metered paid account in overage is never shown as
  // blocked. Backends that predate threshold_state fall back to the legacy
  // derivation (only a non-paid account blocks at zero). ---
  const overIncluded = onPaidPlan && ent.over_included === true;
  const depleted =
    thresholdState != null
      ? thresholdState === "depleted" && !overIncluded
      : !onPaidPlan &&
        (ent.depleted === true ||
          (ent.entitled === false && trial?.kind !== "trial_ended"));

  if (depleted) {
    return {
      variant: "error",
      title: "You're out of credits",
      message: onPaidPlan
        ? `Your ${noun} are paused until your plan renews or more credits are added.`
        : `Your credits are used up. Choose a plan in Billing to keep ${label}.`,
      cta: { kind: "billing", label: "Go to Billing →" },
    };
  }
  // Free-grant blockers the explicit signals didn't catch: the spent grant
  // (remaining <= 0 without any flag) and the lapsed trial clock.
  if (trial && (trial.kind === "out_of_credits" || trial.kind === "trial_ended")) {
    return trialBannerView(trial);
  }
  if (overIncluded) {
    return {
      variant: "warning",
      title: "You've used your included credits",
      message:
        "Extra usage this period is billed as overage at your plan's per-credit rate.",
      cta: { kind: "billing", label: "Go to Billing →" },
    };
  }
  if (
    !onPaidPlan &&
    typeof ent.remaining === "number" &&
    typeof ent.low_threshold === "number" &&
    ent.remaining <= ent.low_threshold
  ) {
    return {
      variant: "warning",
      title: "Running low on credits",
      message: `You're almost out of credits. Pick a plan in Billing so your ${noun} don't get interrupted.`,
      cta: { kind: "billing", label: "Go to Billing →" },
    };
  }
  // Trial active — the countdown flies at the top in YELLOW for the whole
  // trial (Andrew 2026-10-13), yielding only to running-low above.
  if (trial?.kind === "trial_active") {
    return trialBannerView(trial);
  }

  return null;
}

// Parse a USD billing-limit input ("$1,234.56", "50", "50.00") into cents.
// Returns { ok: true, limitCents } or { ok: false, error } with a
// customer-readable message. A limit must be a positive amount — clearing the
// limit is a separate action (null), not "0".
export function parseLimitInput(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/[$,\s]/g, "");
  if (!cleaned) {
    return { ok: false, error: "Enter a dollar amount, e.g. 50 or 50.00." };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return {
      ok: false,
      error: "Enter a valid dollar amount (numbers only, up to 2 decimals).",
    };
  }
  const limitCents = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isSafeInteger(limitCents) || limitCents <= 0) {
    return { ok: false, error: "The limit must be more than $0." };
  }
  return { ok: true, limitCents };
}
