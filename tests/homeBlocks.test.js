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

  it("no periods key → legacy kind (old backends keep the column layout)", () => {
    const view = resolvePeriodComparison({
      last_period: period("Sep 2026", 10),
      current_period: period("Oct 2026", 3),
    });
    expect(view.kind).toBe("legacy");
    expect(view.chart).toBeUndefined();
    expect(view.last.total).toBe(10);
  });

  it("malformed periods → legacy kind, never a crash", () => {
    const legacy = {
      last_period: period("Sep 2026", 10),
      current_period: period("Oct 2026", 3),
    };
    for (const bad of [[], "nope", [{}], [{ label: 42 }]]) {
      expect(resolvePeriodComparison({ ...legacy, periods: bad }).kind).toBe("legacy");
    }
    // A missing/non-array by_action is NOT malformed — it normalizes to [].
    expect(
      resolvePeriodComparison({ ...legacy, periods: [{ label: "x", by_action: "nope" }] }).kind
    ).toBe("periods");
  });
});

describe("resolvePeriodComparison — periods chart view", () => {
  const slice = (name, credits, action) => ({ action: action ?? name.toLowerCase(), name, credits });
  const block = (periods) => ({
    last_period: { label: "Sep 1 – Sep 30", total_credits: 31, by_action: [] },
    current_period: { label: "Oct 1 – present", total_credits: 5, by_action: [] },
    periods,
  });

  it("builds long-format rows period-major, oldest first", () => {
    const view = resolvePeriodComparison(
      block([
        { label: "Aug 2 – Aug 31", total_credits: 7, by_action: [slice("Candidate Fit Scores", 7)] },
        {
          label: "Sep 1 – Sep 30",
          total_credits: 31,
          by_action: [slice("Candidate Pool Scoring", 21), slice("Resume Parsing", 10)],
        },
        { label: "Oct 1 – present", total_credits: 5, by_action: [slice("Resume Parsing", 5)] },
      ])
    );
    expect(view.kind).toBe("periods");
    expect(view.chart.labels).toEqual(["Aug 2 – Aug 31", "Sep 1 – Sep 30", "Oct 1 – present"]);
    expect(view.chart.rows).toEqual([
      { period: "Aug 2 – Aug 31", feature: "Candidate Fit Scores", credits: 7 },
      { period: "Sep 1 – Sep 30", feature: "Candidate Pool Scoring", credits: 21 },
      { period: "Sep 1 – Sep 30", feature: "Resume Parsing", credits: 10 },
      { period: "Oct 1 – present", feature: "Resume Parsing", credits: 5 },
    ]);
  });

  it("assigns palette colors over the alphabetical union; Other pinned", () => {
    const view = resolvePeriodComparison(
      block([
        {
          label: "Sep 1 – Sep 30",
          total_credits: 31,
          by_action: [slice("Resume Parsing", 10), slice("Candidate Pool Scoring", 21)],
        },
        { label: "Oct 1 – present", total_credits: 5, by_action: [slice("Other", 5, "other")] },
      ])
    );
    expect(view.chart.colors).toEqual({
      "Candidate Pool Scoring": "orange",
      "Resume Parsing": "aqua",
      Other: "darkOrange",
    });
  });

  it("zero-usage periods zero-fill one row so the bar still renders", () => {
    const view = resolvePeriodComparison(
      block([
        { label: "Sep 1 – Sep 30", total_credits: 0, by_action: [] },
        { label: "Oct 1 – present", total_credits: 5, by_action: [slice("Resume Parsing", 5)] },
      ])
    );
    expect(view.chart.rows).toEqual([
      // The filler borrows the first named slice — no phantom legend entry.
      { period: "Sep 1 – Sep 30", feature: "Resume Parsing", credits: 0 },
      { period: "Oct 1 – present", feature: "Resume Parsing", credits: 5 },
    ]);
  });

  it("every period empty → filler falls back to Other", () => {
    const view = resolvePeriodComparison(
      block([
        { label: "Sep 1 – Sep 30", total_credits: 0, by_action: [] },
        { label: "Oct 1 – present", total_credits: 0, by_action: [] },
      ])
    );
    expect(view.chart.rows).toEqual([
      { period: "Sep 1 – Sep 30", feature: "Other", credits: 0 },
      { period: "Oct 1 – present", feature: "Other", credits: 0 },
    ]);
  });

  it("caption preserves the per-period totals line", () => {
    const view = resolvePeriodComparison(
      block([
        { label: "Sep 1 – Sep 30", total_credits: 31, by_action: [slice("Resume Parsing", 31)] },
        { label: "Oct 1 – present", total_credits: 1, by_action: [slice("Resume Parsing", 1)] },
      ])
    );
    expect(view.chart.caption).toBe("Sep 1 – Sep 30: 31 credits · Oct 1 – present: 1 credit");
  });

  it("falls back to the raw action when the server sent no name", () => {
    const view = resolvePeriodComparison(
      block([
        {
          label: "Sep 1 – Sep 30",
          total_credits: 3,
          by_action: [{ action: "geo.lookup", credits: 3 }],
        },
        { label: "Oct 1 – present", total_credits: 0, by_action: [] },
      ])
    );
    expect(view.chart.rows[0]).toEqual({
      period: "Sep 1 – Sep 30",
      feature: "geo.lookup",
      credits: 3,
    });
  });

  it("legacy last/current/maxTotal still resolve alongside the chart", () => {
    const view = resolvePeriodComparison(
      block([
        { label: "Sep 1 – Sep 30", total_credits: 31, by_action: [slice("Resume Parsing", 31)] },
        { label: "Oct 1 – present", total_credits: 5, by_action: [] },
      ])
    );
    expect(view.last.total).toBe(31);
    expect(view.current.total).toBe(5);
    expect(view.maxTotal).toBe(31);
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
