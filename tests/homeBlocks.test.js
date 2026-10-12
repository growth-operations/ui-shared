// Unit tests for the Home cockpit block resolvers added for Andrew's
// 2026-10 App Home feedback: the trial banner (three states), the plan-fit
// signal, and the period-over-period comparison. Pure functions — no React.
import { describe, it, expect } from "vitest";
import {
  TRIAL_BANNER_FOOTER,
  resolveTrialBanner,
  resolvePlanFit,
  resolvePeriodComparison,
} from "../src/lib/homeBlocks";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoFromNow = (days) => new Date(Date.now() + days * DAY_MS).toISOString();

// A credits-arm entitlement on the free grant (no plan).
const freeGrant = (over = {}) => ({
  mode: "credits",
  entitled: true,
  granted: 100,
  used: 10,
  remaining: 90,
  grant_expires_at: isoFromNow(12),
  ...over,
});

describe("resolveTrialBanner", () => {
  it("renders nothing for paid plans, non-credits modes, and pre-install", () => {
    expect(resolveTrialBanner(freeGrant({ plan: "starter" }))).toBe(null);
    expect(resolveTrialBanner({ mode: "legacy" })).toBe(null);
    expect(
      resolveTrialBanner(freeGrant({ status: "not_installed" }))
    ).toBe(null);
    expect(resolveTrialBanner(null)).toBe(null);
  });

  it("trial active — the countdown state with the footer line", () => {
    const banner = resolveTrialBanner(freeGrant(), { appName: "Test App" });
    expect(banner.variant).toBe("info");
    expect(banner.title).toBe("12 trial days remaining");
    expect(banner.body).toBe(
      "You have 12 days remaining in your trial period. Select a plan to continue use of Test App."
    );
    expect(banner.footer).toBe(TRIAL_BANNER_FOOTER);
    expect(banner.footer).toBe("Need help? info@growthoperationsco.com");
  });

  it("trial ended — the clock ran out with credits left", () => {
    const banner = resolveTrialBanner(
      freeGrant({ grant_expires_at: isoFromNow(-2) }),
      { appName: "Test App" }
    );
    expect(banner.variant).toBe("warning");
    expect(banner.title).toBe("Your trial has ended");
    expect(banner.body).toBe(
      "Your free trial has ended. Select a plan to continue use of Test App."
    );
  });

  it("out of credits — the grant is spent", () => {
    const banner = resolveTrialBanner(
      freeGrant({ used: 100, remaining: 0, depleted: true }),
      { appName: "Test App" }
    );
    expect(banner.variant).toBe("error");
    expect(banner.title).toBe("You're out of credits");
    expect(banner.body).toBe(
      "You have used 100/100 free credits. Select one of the plans below to continue use of Test App."
    );
  });

  it("out of credits BEATS the clock — spent grant with days left is not 'active'", () => {
    const banner = resolveTrialBanner(
      freeGrant({
        used: 100,
        remaining: 0,
        depleted: true,
        grant_expires_at: isoFromNow(20), // plenty of clock left
      }),
      { appName: "Test App" }
    );
    expect(banner.title).toBe("You're out of credits");
    expect(banner.variant).toBe("error");
  });

  it("renders nothing when the backend carries no grant clock", () => {
    const noClock = freeGrant();
    delete noClock.grant_expires_at;
    expect(resolveTrialBanner(noClock, { appName: "Test App" })).toBe(null);
  });

  it("falls back to 'this app' without a display name", () => {
    const banner = resolveTrialBanner(freeGrant());
    expect(banner.body).toContain("continue use of this app.");
  });
});

describe("resolvePlanFit", () => {
  it("returns null when the block is absent or the verdict is unknown", () => {
    expect(resolvePlanFit(null)).toBe(null);
    expect(resolvePlanFit(undefined)).toBe(null);
    expect(resolvePlanFit({ verdict: "no_data" })).toBe(null);
    expect(resolvePlanFit({})).toBe(null);
  });

  it("right_plan — the hero reinforcement, NOT a banner", () => {
    expect(resolvePlanFit({ verdict: "right_plan" })).toEqual({
      kind: "right_plan",
    });
  });

  it("upgrade_recommended — full copy with tier, savings, and pack count", () => {
    const fit = resolvePlanFit({
      verdict: "upgrade_recommended",
      target_tier: "professional",
      monthly_savings_usd: 40,
      topup_packs_this_period: 3,
    });
    expect(fit.kind).toBe("upgrade_recommended");
    expect(fit.text).toBe(
      "You could save $40/mo by moving to Professional — you bought 3 additional credit packs this period."
    );
  });

  it("upgrade_recommended — singular pack count", () => {
    const fit = resolvePlanFit({
      verdict: "upgrade_recommended",
      target_tier: "pro",
      monthly_savings_usd: 12.5,
      topup_packs_this_period: 1,
    });
    expect(fit.text).toBe(
      "You could save $12.50/mo by moving to Pro — you bought 1 additional credit pack this period."
    );
  });

  it("upgrade_recommended — degrades when the savings can't be priced yet", () => {
    const fit = resolvePlanFit({
      verdict: "upgrade_recommended",
      target_tier: "professional",
      topup_packs_this_period: 2,
    });
    expect(fit.text).toBe(
      "You could save by moving to Professional — you bought 2 additional credit packs this period."
    );
  });

  it("upgrade_recommended — degrades further with no tier either", () => {
    const fit = resolvePlanFit({
      verdict: "upgrade_recommended",
      topup_packs_this_period: 4,
    });
    expect(fit.text).toBe(
      "A higher plan may cost you less — you bought 4 additional credit packs this period."
    );
  });
});

describe("resolvePeriodComparison", () => {
  const period = (label, total, byAction = []) => ({
    label,
    total_credits: total,
    by_action: byAction,
  });

  it("returns null until the install has one full closed period", () => {
    expect(resolvePeriodComparison(null)).toBe(null);
    expect(resolvePeriodComparison(undefined)).toBe(null);
    expect(resolvePeriodComparison({})).toBe(null);
    expect(
      resolvePeriodComparison({ last_period: period("Sep 2026", 100) })
    ).toBe(null);
    expect(
      resolvePeriodComparison({ current_period: period("Oct 2026", 40) })
    ).toBe(null);
  });

  it("normalizes both periods and shares the max denominator", () => {
    const view = resolvePeriodComparison({
      last_period: period("Sep 2026", 120, [
        { action: "Enrich contact", credits: 100 },
        { action: "Score lead", credits: 20 },
      ]),
      current_period: period("Oct 2026", 45),
    });
    expect(view.last).toEqual({
      label: "Sep 2026",
      total: 120,
      byAction: [
        { action: "Enrich contact", credits: 100 },
        { action: "Score lead", credits: 20 },
      ],
    });
    expect(view.current).toEqual({
      label: "Oct 2026",
      total: 45,
      byAction: [],
    });
    expect(view.maxTotal).toBe(120);
  });

  it("a pair of zero periods never divides by zero (maxTotal >= 1)", () => {
    const view = resolvePeriodComparison({
      last_period: period("Sep 2026", 0),
      current_period: period("Oct 2026", 0),
    });
    expect(view.maxTotal).toBe(1);
  });

  it("drops malformed by_action entries", () => {
    const view = resolvePeriodComparison({
      last_period: period("Sep 2026", 10, [{ credits: 5 }, null, { action: "Run", credits: 5 }]),
      current_period: period("Oct 2026", 3),
    });
    expect(view.last.byAction).toEqual([{ action: "Run", credits: 5 }]);
  });
});
