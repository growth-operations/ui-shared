import { describe, it, expect } from "vitest";
import {
  hasTopUpBank,
  resolveCreditMeter,
  resolveBillingBanner,
  parseLimitInput,
} from "../src/lib/creditDisplay";

// --- Fixtures ---------------------------------------------------------------

// Legacy (pre-top-up backend): no top-up fields at all.
const legacyFree = (over = {}) => ({
  mode: "credits",
  entitled: true,
  granted: 100,
  used: 37,
  remaining: 63,
  low_threshold: 10,
  depleted: false,
  plan: null,
  ...over,
});

// New backend, metered model: carries the top-up fields with zero values.
const meteredPaid = (over = {}) => ({
  mode: "credits",
  entitled: true,
  granted: 1000,
  used: 400,
  remaining: 600,
  low_threshold: 100,
  depleted: false,
  over_included: false,
  plan: "starter",
  top_up_bank_remaining: 0,
  last_top_up_at: null,
  threshold_state: "healthy",
  ...over,
});

// New backend, topup model with a bank. Defaults to the canonical post-reset
// example: pool 1000, band 1000 with 300 used, period just reset.
const topupWithBank = (over = {}) => ({
  mode: "credits",
  entitled: true,
  granted: 1700, // pool 1000 + bank remaining 700
  used: 0, // granted - remaining
  remaining: 1700,
  low_threshold: 100,
  depleted: false,
  over_included: false,
  plan: "starter",
  top_up_bank_remaining: 700,
  last_top_up_at: "2026-09-20T14:03:00Z",
  threshold_state: "healthy",
  ...over,
});

// --- hasTopUpBank -----------------------------------------------------------

describe("hasTopUpBank", () => {
  it("is false for legacy arms without the fields", () => {
    expect(hasTopUpBank(legacyFree())).toBe(false);
  });

  it("is false when the bank is empty AND no top-up was ever granted", () => {
    expect(hasTopUpBank(meteredPaid())).toBe(false);
  });

  it("is true when bank credits remain", () => {
    expect(hasTopUpBank(topupWithBank())).toBe(true);
  });

  it("is true when the bank is spent but a top-up was granted before", () => {
    expect(hasTopUpBank(topupWithBank({ top_up_bank_remaining: 0 }))).toBe(true);
  });

  it("is false for null", () => {
    expect(hasTopUpBank(null)).toBe(false);
  });
});

// --- resolveCreditMeter -----------------------------------------------------

describe("resolveCreditMeter", () => {
  it("returns null when there is no credit data", () => {
    expect(resolveCreditMeter(null, null)).toBe(null);
    expect(resolveCreditMeter({ mode: "trial_subscription" }, null)).toBe(null);
  });

  it("keeps meter-first precedence on legacy backends (no top-up fields)", () => {
    const view = resolveCreditMeter(legacyFree(), {
      granted: 100,
      used: 40,
      remaining: 60,
      recent: [],
    });
    expect(view.used).toBe(40);
    expect(view.remaining).toBe(60);
    expect(view.bank).toBe(null);
  });

  it("prefers the entitlement numbers once the top-up fields are present", () => {
    // The credit_meter block stays RAW pool-only under the topup model; the
    // entitlement arm carries the combined display and must win.
    const view = resolveCreditMeter(topupWithBank(), {
      granted: 1000,
      used: 0,
      remaining: 1000,
      recent: [],
    });
    expect(view.granted).toBe(1700);
    expect(view.remaining).toBe(1700);
  });

  it("splits pool vs bank — canonical post-reset math: '0 of 1,700'", () => {
    // Pool 1000, band 1000, 300 bank used, period just reset: combined
    // granted 1700, used 0, remaining 1700; the pool segment refilled while
    // the bank shows what's left.
    const view = resolveCreditMeter(topupWithBank(), null);
    expect(view.used).toBe(0);
    expect(view.granted).toBe(1700);
    expect(view.bank).toEqual({
      bankRemaining: 700,
      poolGrant: 1000,
      poolRemaining: 1000,
      poolUsed: 0,
    });
  });

  it("splits pool vs bank — pool exhausted, bank drawing down", () => {
    // Pool 1000 spent; bank at 500 of 1000. Combined: granted 1500,
    // remaining 500, used 1000.
    const view = resolveCreditMeter(
      topupWithBank({
        granted: 1500,
        remaining: 500,
        used: 1000,
        top_up_bank_remaining: 500,
      }),
      null
    );
    expect(view.bank).toEqual({
      bankRemaining: 500,
      poolGrant: 1000,
      poolRemaining: 0,
      poolUsed: 1000,
    });
  });

  it("splits pool vs bank — mid-pool, bank untouched", () => {
    const view = resolveCreditMeter(
      topupWithBank({
        granted: 2000, // pool 1000 + bank 1000
        remaining: 1600,
        used: 400,
        top_up_bank_remaining: 1000,
      }),
      null
    );
    expect(view.bank).toEqual({
      bankRemaining: 1000,
      poolGrant: 1000,
      poolRemaining: 600,
      poolUsed: 400,
    });
  });

  it("never blocks a metered paid account in overage (2026-09-02 regression)", () => {
    const view = resolveCreditMeter(
      meteredPaid({ used: 1200, remaining: 0, over_included: true }),
      null
    );
    expect(view.depleted).toBe(false);
    expect(view.overIncluded).toBe(true);
    expect(view.tagLabel).toBe("Over included");
    expect(view.alert.title).toBe("You've used your included credits");
    expect(view.alert.variant).toBe("warning");
  });

  it("never blocks a legacy paid account on an old backend (raw fallback)", () => {
    // No threshold_state/over_included — the raw used > granted derivation.
    const view = resolveCreditMeter(
      legacyFree({ plan: "starter", granted: 1000, used: 1200, remaining: 0 }),
      null
    );
    expect(view.depleted).toBe(false);
    expect(view.overIncluded).toBe(true);
  });

  it("blocks a legacy FREE account at zero (unchanged)", () => {
    const view = resolveCreditMeter(
      legacyFree({ remaining: 0, used: 100, depleted: true }),
      null
    );
    expect(view.depleted).toBe(true);
    expect(view.tagVariant).toBe("danger");
    expect(view.tagLabel).toBe("Depleted");
    expect(view.alert).toEqual({
      variant: "error",
      title: "You're out of credits",
      message: "Pick a plan or buy more credits to keep going.",
    });
  });

  it("blocks a topup-model PAID account only at threshold_state depleted", () => {
    const view = resolveCreditMeter(
      topupWithBank({
        granted: 1000, // pool 1000 + bank 0
        remaining: 0,
        used: 1000,
        top_up_bank_remaining: 0,
        threshold_state: "depleted",
        depleted: true,
        entitled: false,
      }),
      null
    );
    expect(view.depleted).toBe(true);
    expect(view.alert).toEqual({
      variant: "error",
      title: "You're out of credits",
      message:
        "Actions are paused until your next billing period or a successful top-up.",
    });
    // Bank is spent but existed — the two-segment breakdown still renders.
    expect(view.bank).not.toBe(null);
  });

  it("still treats over_included as not-blocked even if threshold_state says depleted", () => {
    // Defensive: a mixed/stale payload must not regress the 2026-09-02 incident.
    const view = resolveCreditMeter(
      meteredPaid({ threshold_state: "depleted", over_included: true, remaining: 0 }),
      null
    );
    expect(view.depleted).toBe(false);
    expect(view.overIncluded).toBe(true);
  });

  it("maps top_up_pending to a calm info tag with no alert", () => {
    const view = resolveCreditMeter(
      topupWithBank({ threshold_state: "top_up_pending" }),
      null
    );
    expect(view.tagLabel).toBe("Adding credits");
    expect(view.tagVariant).toBe("info");
    expect(view.alert).toBe(null);
  });

  it("maps top_up_failed to a danger tag + payment-method alert", () => {
    const view = resolveCreditMeter(
      topupWithBank({ threshold_state: "top_up_failed" }),
      null
    );
    expect(view.tagLabel).toBe("Top-up failed");
    expect(view.tagVariant).toBe("danger");
    expect(view.alert.variant).toBe("error");
    expect(view.alert.title).toBe("We couldn't add credits");
  });

  it("maps limit_reached to a warning tag + limit alert", () => {
    const view = resolveCreditMeter(
      topupWithBank({ threshold_state: "limit_reached" }),
      null
    );
    expect(view.tagLabel).toBe("Limit reached");
    expect(view.tagVariant).toBe("warning");
    expect(view.alert.variant).toBe("warning");
    expect(view.alert.title).toBe("Billing limit reached");
  });

  it("flags running-low on the free tier (unchanged)", () => {
    const view = resolveCreditMeter(legacyFree({ remaining: 8, used: 92 }), null);
    expect(view.low).toBe(true);
    expect(view.tagLabel).toBe("Running low");
    expect(view.alert.title).toBe("Running low on credits");
  });
});

// --- resolveBillingBanner ---------------------------------------------------

describe("resolveBillingBanner", () => {
  it("renders nothing outside the credits arm or pre-install", () => {
    expect(resolveBillingBanner(null)).toBe(null);
    expect(resolveBillingBanner({ mode: "trial_subscription" })).toBe(null);
    expect(
      resolveBillingBanner(legacyFree({ status: "not_installed" }))
    ).toBe(null);
  });

  it("healthy accounts render nothing", () => {
    expect(resolveBillingBanner(meteredPaid())).toBe(null);
    expect(resolveBillingBanner(topupWithBank())).toBe(null);
  });

  it("top_up_pending -> calm info, no CTA", () => {
    const banner = resolveBillingBanner(
      topupWithBank({ threshold_state: "top_up_pending" })
    );
    expect(banner.variant).toBe("info");
    expect(banner.title).toBe("Adding credits automatically");
    expect(banner.cta).toBe(null);
  });

  it("top_up_failed -> error with a payment-method portal CTA", () => {
    const banner = resolveBillingBanner(
      topupWithBank({ threshold_state: "top_up_failed" }),
      { actionsNoun: "file actions" }
    );
    expect(banner.variant).toBe("error");
    expect(banner.title).toBe("We couldn't add credits");
    expect(banner.message).toContain("file actions");
    expect(banner.cta).toEqual({
      kind: "portal",
      label: "Update payment method",
    });
  });

  it("limit_reached -> warning with a raise-limit Billing CTA", () => {
    const banner = resolveBillingBanner(
      topupWithBank({ threshold_state: "limit_reached" })
    );
    expect(banner.variant).toBe("warning");
    expect(banner.title).toBe("Billing limit reached");
    expect(banner.cta).toEqual({
      kind: "billing",
      label: "Raise your billing limit",
    });
  });

  it("depleted on a PAID topup account -> error, blocking wording", () => {
    const banner = resolveBillingBanner(
      topupWithBank({
        threshold_state: "depleted",
        depleted: true,
        entitled: false,
        remaining: 0,
        top_up_bank_remaining: 0,
      }),
      { actionsNoun: "task actions" }
    );
    expect(banner.variant).toBe("error");
    expect(banner.title).toBe("You're out of credits");
    expect(banner.message).toBe(
      "Your task actions are paused until your next billing period or a successful top-up."
    );
  });

  it("legacy free depleted -> byte-identical pre-top-up copy", () => {
    const banner = resolveBillingBanner(
      legacyFree({ remaining: 0, used: 100, depleted: true }),
      { actionLabel: "attaching and updating files" }
    );
    expect(banner).toEqual({
      variant: "error",
      title: "You're out of credits",
      message:
        "Your credits are used up. Choose a plan in Billing to keep attaching and updating files.",
      cta: { kind: "billing", label: "Go to Billing →" },
    });
  });

  it("legacy paid overage -> byte-identical calm warning (never blocked)", () => {
    const banner = resolveBillingBanner(
      meteredPaid({ over_included: true, used: 1200, remaining: 0 })
    );
    expect(banner).toEqual({
      variant: "warning",
      title: "You've used your included credits",
      message:
        "Extra usage this period is billed as overage at your plan's per-credit rate.",
      cta: { kind: "billing", label: "Go to Billing →" },
    });
  });

  it("metered paid with a stale depleted threshold_state + overage -> still not blocked", () => {
    const banner = resolveBillingBanner(
      meteredPaid({
        threshold_state: "depleted",
        over_included: true,
        remaining: 0,
      })
    );
    expect(banner.variant).toBe("warning");
    expect(banner.title).toBe("You've used your included credits");
  });

  it("legacy free running-low -> byte-identical warning copy", () => {
    const banner = resolveBillingBanner(legacyFree({ remaining: 8, used: 92 }), {
      actionsNoun: "task actions",
    });
    expect(banner).toEqual({
      variant: "warning",
      title: "Running low on credits",
      message:
        "You're almost out of credits. Pick a plan in Billing so your task actions don't get interrupted.",
      cta: { kind: "billing", label: "Go to Billing →" },
    });
  });
});

// --- parseLimitInput --------------------------------------------------------

describe("parseLimitInput", () => {
  it("parses plain dollars and cents", () => {
    expect(parseLimitInput("50")).toEqual({ ok: true, limitCents: 5000 });
    expect(parseLimitInput("50.00")).toEqual({ ok: true, limitCents: 5000 });
    expect(parseLimitInput("99.95")).toEqual({ ok: true, limitCents: 9995 });
  });

  it("tolerates $, commas, and whitespace", () => {
    expect(parseLimitInput(" $1,234.56 ")).toEqual({ ok: true, limitCents: 123456 });
  });

  it("rejects empty input", () => {
    expect(parseLimitInput("").ok).toBe(false);
    expect(parseLimitInput("   ").ok).toBe(false);
    expect(parseLimitInput(null).ok).toBe(false);
  });

  it("rejects non-numeric and over-precise input", () => {
    expect(parseLimitInput("abc").ok).toBe(false);
    expect(parseLimitInput("10.999").ok).toBe(false);
    expect(parseLimitInput("-5").ok).toBe(false);
  });

  it("rejects zero — clearing the limit is a separate action", () => {
    expect(parseLimitInput("0").ok).toBe(false);
    expect(parseLimitInput("0.00").ok).toBe(false);
  });
});
