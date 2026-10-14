// PeriodComparison's "periods" rendering: ONE stacked BarChart (one bar per
// billing period, stacks = features) replacing the legacy two progress-bar
// columns when the backend ships the additive `periods` payload.
import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@hubspot/ui-extensions", async () => {
  return await import("./helpers/uiExtensionsMock.js");
});

import { PeriodComparison } from "../src/home/PeriodComparison";
import { renderComponent, findAll, textOf } from "./helpers/render";

const slice = (name, credits) => ({ action: name.toLowerCase(), name, credits });

const periodsBlock = {
  last_period: { label: "Sep 1 – Sep 30", total_credits: 31, by_action: [] },
  current_period: { label: "Oct 1 – present", total_credits: 5, by_action: [] },
  periods: [
    { label: "Sep 1 – Sep 30", total_credits: 31, by_action: [slice("Candidate Pool Scoring", 21), slice("Resume Parsing", 10)] },
    { label: "Oct 1 – present", total_credits: 5, by_action: [slice("Resume Parsing", 5)] },
  ],
};

const legacyBlock = {
  last_period: { label: "Sep 1 – Sep 30", total_credits: 31, by_action: [{ action: "geo.lookup", credits: 31 }] },
  current_period: { label: "Oct 1 – present", total_credits: 5, by_action: [] },
};

// Walk the RAW element tree (expanding local function components) so the
// BarChart element's React key — the hard-remount fingerprint — is visible.
// renderComponent/resolve() drops keys (they live on the element, not props).
function* walkRaw(node) {
  if (node == null || typeof node === "boolean") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* walkRaw(n);
    return;
  }
  if (!React.isValidElement(node)) return;
  yield node;
  const { type, props } = node;
  if (typeof type === "function" && !type.displayName) {
    yield* walkRaw(type(props)); // local component (PeriodsChart) — expand
  } else {
    yield* walkRaw(props?.children);
  }
}

const barChartsOf = (tree) =>
  [...walkRaw(tree)].filter((el) => el.type?.displayName === "BarChart");

describe("PeriodComparison — periods chart", () => {
  it("renders nothing until the backend has a closed period", () => {
    expect(PeriodComparison({ state: { state: {} } })).toBe(null);
    expect(PeriodComparison({ state: null })).toBe(null);
  });

  it("renders ONE stacked BarChart with category x-axis + legend", () => {
    const tree = PeriodComparison({ state: { state: { period_comparison: periodsBlock } } });
    const charts = barChartsOf(tree);
    expect(charts).toHaveLength(1);
    const chart = charts[0];
    expect(chart.props.data).toEqual([
      { period: "Sep 1 – Sep 30", feature: "Candidate Pool Scoring", credits: 21 },
      { period: "Sep 1 – Sep 30", feature: "Resume Parsing", credits: 10 },
      { period: "Oct 1 – present", feature: "Resume Parsing", credits: 5 },
    ]);
    expect(chart.props.axes).toEqual({
      x: { field: "period", fieldType: "category", label: "Billing period" },
      y: { field: "credits", fieldType: "linear", label: "Credits" },
      options: {
        groupFieldByColor: "feature",
        stacking: true,
        colors: {
          "Candidate Pool Scoring": "orange",
          "Resume Parsing": "aqua",
          Other: "darkOrange",
        },
      },
    });
    expect(chart.props.options).toEqual({
      showLegend: true,
      showTooltips: true,
      showDataLabels: false,
    });
  });

  it("shows the per-period totals caption as microcopy", () => {
    const tree = renderComponent(PeriodComparison, {
      state: { state: { period_comparison: periodsBlock } },
    });
    expect(textOf(tree)).toContain("Sep 1 – Sep 30: 31 credits · Oct 1 – present: 5 credits");
  });

  it("hard-remounts the chart on a data change (remote component)", () => {
    // BarChart is a HubSpot remote component — prop changes alone don't
    // re-render it (see UsageTab), so the React key fingerprints the rows.
    const before = barChartsOf(
      PeriodComparison({ state: { state: { period_comparison: periodsBlock } } })
    )[0];
    const changed = {
      ...periodsBlock,
      periods: periodsBlock.periods.map((p, i) =>
        i === 1 ? { ...p, by_action: [slice("Resume Parsing", 9)] } : p
      ),
    };
    const after = barChartsOf(
      PeriodComparison({ state: { state: { period_comparison: changed } } })
    )[0];
    expect(before.key).toBeTruthy();
    expect(after.key).toBeTruthy();
    expect(after.key).not.toBe(before.key);
  });

  it("reads a top-level period_comparison too (self-hosted duality)", () => {
    const tree = PeriodComparison({ state: { period_comparison: periodsBlock } });
    expect(barChartsOf(tree)).toHaveLength(1);
  });
});

describe("PeriodComparison — legacy fallback", () => {
  it("no periods key → the two progress-bar columns, no chart", () => {
    const tree = PeriodComparison({ state: { state: { period_comparison: legacyBlock } } });
    expect(barChartsOf(tree)).toHaveLength(0);
    const resolved = renderComponent(PeriodComparison, {
      state: { state: { period_comparison: legacyBlock } },
    });
    expect(findAll(resolved, "ProgressBar")).toHaveLength(2);
    expect(textOf(resolved)).toContain("geo.lookup: 31 credits");
  });
});
