// Unit tests for the Home cockpit block resolvers added for Andrew's
// 2026-10 App Home feedback: the plan-fit signal and the period-over-period
// comparison. Pure functions — no React.
//
// (The trial banner resolver used to be tested here. Andrew 2026-10-13: the
// trial states consolidated into the top BillingBanner — see the
// resolveBillingBanner trial tests in creditDisplay.test.js.)
import { describe, it, expect } from "vitest";
import {
  resolvePlanFit,
  planFitOf,
  resolvePeriodComparison,
  periodComparisonOf,
} from "../src/lib/homeBlocks";

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

// Dual-read helpers: base-hosted backends nest these blocks under
// payload.state; a self-hosted backend may emit them top-level. Reading only
// one location left PlanFitBanner/PeriodComparison dead on base-hosted apps
// (shipped 2026-10-12, found 2026-10-13).
describe("planFitOf", () => {
  const fit = {
    verdict: "upgrade_recommended",
    target_tier: "professional",
    monthly_savings_usd: 40,
    topup_packs_this_period: 3,
  };

  it("reads the nested payload.state.plan_fit (base-hosted shape)", () => {
    const view = planFitOf({ state: { plan_fit: fit } });
    expect(view?.kind).toBe("upgrade_recommended");
  });

  it("falls back to a top-level plan_fit (self-hosted shape)", () => {
    const view = planFitOf({ plan_fit: fit });
    expect(view?.kind).toBe("upgrade_recommended");
  });

  it("nested wins when both are present", () => {
    const view = planFitOf({
      plan_fit: { verdict: "right_plan" },
      state: { plan_fit: fit },
    });
    expect(view?.kind).toBe("upgrade_recommended");
  });

  it("returns null when neither is present or state is malformed", () => {
    expect(planFitOf({})).toBe(null);
    expect(planFitOf(null)).toBe(null);
    expect(planFitOf("nope")).toBe(null);
  });
});

describe("periodComparisonOf", () => {
  const period = (label, total) => ({
    label,
    total_credits: total,
    by_action: [],
  });
  const block = {
    last_period: period("Sep 2026", 120),
    current_period: period("Oct 2026", 45),
  };

  it("reads the nested payload.state.period_comparison (base-hosted shape)", () => {
    const view = periodComparisonOf({ state: { period_comparison: block } });
    expect(view?.last.total).toBe(120);
    expect(view?.maxTotal).toBe(120);
  });

  it("falls back to a top-level period_comparison (self-hosted shape)", () => {
    const view = periodComparisonOf({ period_comparison: block });
    expect(view?.current.total).toBe(45);
  });

  it("returns null when neither is present or the block is incomplete", () => {
    expect(periodComparisonOf({})).toBe(null);
    expect(periodComparisonOf(null)).toBe(null);
    expect(
      periodComparisonOf({ state: { period_comparison: { last_period: period("Sep", 1) } } })
    ).toBe(null);
  });
});
