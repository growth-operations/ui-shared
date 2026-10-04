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
//   tagVariant/tagLabel  — StatusTag rendering
//   barVariant           — ProgressBar sentiment for the pool/single bar:
//                          the tag's depletion mapping minus "info"
//                          (ProgressBar only takes success/warning/danger;
//                          top_up_pending is calm/positive, so success).
//                          The bank bar is always "success" (a never-expiring
//                          balance has no negative direction).
//   alert                — { variant, title, message } or null
//   grantExpiresAt       — pass-through for the free-grant countdown
export function resolveCreditMeter(entitlement, creditMeter) {
  const ent = entitlement?.mode === "credits" ? entitlement : null;
  const meter = creditMeter ?? null;
  if (!ent && !meter) return null;

  // Number precedence: once the entitlement arm carries the top-up fields it
  // is authoritative — the credit_meter block stays RAW pool-only under the
  // topup model, so reading meter-first would hide the bank. On older
  // backends (no top-up fields) keep the historical meter-first precedence
  // (the meter is the richer block: it carries `recent`).
  const entHasTopUpFields =
    ent != null && typeof ent.top_up_bank_remaining === "number";
  const pick = (key) =>
    entHasTopUpFields ? ent[key] ?? meter?.[key] : meter?.[key] ?? ent?.[key];

  const granted = pick("granted") ?? 0;
  const used = pick("used") ?? 0;
  const remaining = pick("remaining") ?? Math.max(granted - used, 0);

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
  // The bank section renders ONLY while the bank has credits left
  // (bankRemaining > 0): a zero bank — never topped up, or fully burned —
  // renders the plain single-pool bar, and with bankRemaining 0 the combined
  // numbers ARE the pool numbers (granted == poolGrant, remaining ==
  // poolRemaining), so nothing is lost.
  let bank = null;
  const bankRemaining = Math.max(0, ent?.top_up_bank_remaining ?? 0);
  if (bankRemaining > 0) {
    const poolGrant = Math.max(granted - bankRemaining, 0);
    const poolRemaining = Math.min(Math.max(remaining - bankRemaining, 0), poolGrant);
    bank = {
      bankRemaining,
      // The bank's lifetime granted total — the bank bar's denominator. 0 on
      // backends that predate top_up_bank_granted (the component degrades to
      // a text-only bank line; never divide by zero, never "of 0").
      bankGranted: Math.max(0, ent?.top_up_bank_granted ?? 0),
      poolGrant,
      poolRemaining,
      poolUsed: poolGrant - poolRemaining,
    };
  }

  let tagVariant;
  let tagLabel;
  if (depleted) {
    tagVariant = "danger";
    tagLabel = "Depleted";
  } else if (thresholdState === "top_up_failed") {
    tagVariant = "danger";
    tagLabel = "Top-up failed";
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

  // ProgressBar sentiment for the pool bar (and the no-bank single bar):
  // color-coded by depletion — success when healthy, warning at/below the
  // low threshold (and for the other warning-level states), danger when
  // depleted/top-up-failed. ProgressBar has no "info" variant, so the calm
  // top_up_pending state renders success.
  const barVariant = tagVariant === "info" ? "success" : tagVariant;

  // The inline meter alert mirrors the banner's messaging at the point of
  // glance. Legacy branches keep their pre-top-up copy byte-for-byte.
  let alert = null;
  if (depleted) {
    alert = {
      variant: "error",
      title: "You're out of credits",
      message: onPaidPlan
        ? "Actions are paused until your next billing period or a successful top-up."
        : "Choose a plan to resume your use.",
    };
  } else if (thresholdState === "top_up_failed") {
    alert = {
      variant: "error",
      title: "We couldn't add credits",
      message:
        "The automatic top-up charge failed — update your payment method in Billing.",
    };
  } else if (thresholdState === "limit_reached") {
    alert = {
      variant: "warning",
      title: "Billing limit reached",
      message:
        "Automatic top-ups are paused at your spending limit for this period. Raise your billing limit in Billing to resume them.",
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
      message: "You're getting close to your limit — pick a plan to top up.",
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
    barVariant,
    alert,
    grantExpiresAt: ent?.grant_expires_at ?? null,
  };
}

// Resolve the app-wide BillingBanner from the credits entitlement arm.
// Returns null to render nothing (non-credits mode, pre-install, or healthy),
// else { variant, title, message, cta } where cta is null or:
//   { kind: "portal",  label } — link out to the Stripe billing-portal entry
//                                point (payment-method fixes)
//   { kind: "billing", label } — in-app navigate to the Billing tab
//
// Driven by threshold_state for the top-up model; the legacy metered branches
// (free depleted / paid over_included / free running-low) are byte-identical
// to the pre-top-up banner.
export function resolveBillingBanner(entitlement, { actionLabel, actionsNoun } = {}) {
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
      message: `The automatic top-up charge failed. Update your payment method so your ${noun} aren't interrupted.`,
      cta: { kind: "portal", label: "Update payment method" },
    };
  }
  if (thresholdState === "limit_reached") {
    return {
      variant: "warning",
      title: "Billing limit reached",
      message:
        "Automatic top-ups are paused — you've hit your spending limit for this billing period. Raise your billing limit to keep them going.",
      cta: { kind: "billing", label: "Raise your billing limit" },
    };
  }

  // --- Hard-blocked. threshold_state "depleted" is the ONLY blocking state
  // (a topup-model paid plan blocks at true zero); `over_included` overrides
  // a depleted reading so a metered paid account in overage is never shown as
  // blocked. Backends that predate threshold_state fall back to the legacy
  // derivation (only a non-paid account blocks at zero). ---
  const overIncluded = onPaidPlan && ent.over_included === true;
  const depleted =
    thresholdState != null
      ? thresholdState === "depleted" && !overIncluded
      : !onPaidPlan && (ent.depleted === true || ent.entitled === false);

  if (depleted) {
    return {
      variant: "error",
      title: "You're out of credits",
      message: onPaidPlan
        ? `Your ${noun} are paused until your next billing period or a successful top-up.`
        : `Your credits are used up. Choose a plan in Billing to keep ${label}.`,
      cta: { kind: "billing", label: "Go to Billing →" },
    };
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
