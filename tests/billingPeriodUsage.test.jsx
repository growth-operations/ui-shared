// BillingPeriodUsage — the billing-period usage chart (UsageTab
// chart="billingPeriods", and the GOAA internal Installation card via the
// fetchUsage override). Tests target the hook-free view + pure helpers (the
// repo has no DOM renderer; hookful shells are untestable here — UsageTab's
// UsageContent sets that precedent).
import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@hubspot/ui-extensions", async () => {
  return await import("./helpers/uiExtensionsMock.js");
});

import {
  BILLING_PERIOD_OPTIONS,
  BillingPeriodUsageView,
  makeUsageFetcher,
  usageUrl,
  usedWindowLabel,
} from "../src/usage/BillingPeriodUsage";
import { AppHome } from "../src/home/AppHome";
import { hubspot } from "@hubspot/ui-extensions";
import {
  renderComponent,
  renderShallow,
  findAll,
  textOf,
} from "./helpers/render";

const cell = (period, feature, credits) => ({ period, feature, credits });

const PAYLOAD = {
  series: [
    cell("Aug 12 – Sep 12", "Fit Scores", 4),
    cell("Sep 12 – Oct 12", "Fit Scores", 6),
    cell("Sep 12 – Oct 12", "Resume Parsing", 50),
    cell("Oct 12 – Nov 12", "Resume Parsing", 25),
  ],
  used_in_window: 85,
  granted: 5000,
  remaining: 4915,
};

describe("BILLING_PERIOD_OPTIONS", () => {
  it("is Current/Last 2/Last 3/Last 6/Last 12, values in periods", () => {
    expect(BILLING_PERIOD_OPTIONS).toEqual([
      { label: "Current", value: "1" },
      { label: "Last 2", value: "2" },
      { label: "Last 3", value: "3" },
      { label: "Last 6", value: "6" },
      { label: "Last 12", value: "12" },
    ]);
  });
});

describe("usedWindowLabel", () => {
  it("singularizes the current period", () => {
    expect(usedWindowLabel("1")).toBe("Used (current billing period)");
    expect(usedWindowLabel("3")).toBe("Used (last 3 billing periods)");
    expect(usedWindowLabel("12")).toBe("Used (last 12 billing periods)");
  });
});

describe("usageUrl", () => {
  it("builds the periods query against the base URL", () => {
    expect(
      usageUrl({
        baseUrl: "https://ats.example.com",
        basePath: "/v1/usage",
        portalId: 123,
        periods: "6",
      })
    ).toBe("https://ats.example.com/v1/usage?portalId=123&periods=6");
  });
});

describe("makeUsageFetcher", () => {
  it("fetches portalId + periods from the standard endpoint", async () => {
    hubspot.fetch.mockResolvedValueOnce({ json: async () => PAYLOAD });
    const fetcher = makeUsageFetcher({
      context: { variables: { BASE_URL: "https://ats.example.com" }, portal: { id: 555 } },
      basePath: "/v1/usage",
    });
    const out = await fetcher("2");
    expect(hubspot.fetch).toHaveBeenCalledWith(
      "https://ats.example.com/v1/usage?portalId=555&periods=2",
      { method: "GET", timeout: 15000 }
    );
    expect(out).toBe(PAYLOAD);
  });
});

describe("BillingPeriodUsageView", () => {
  const render = (over = {}) =>
    renderComponent(BillingPeriodUsageView, {
      data: PAYLOAD,
      periods: "3",
      appName: "ATS",
      showStats: true,
      ...over,
    });

  it("renders one stacked BarChart keyed on the period label, stacked by feature", () => {
    const tree = render();
    const charts = findAll(tree, "BarChart");
    expect(charts).toHaveLength(1);
    const chart = charts[0];
    expect(chart.data).toBe(PAYLOAD.series);
    expect(chart.axes.x).toEqual({
      field: "period",
      fieldType: "category",
      label: "Billing period",
    });
    expect(chart.axes.options).toEqual({
      groupFieldByColor: "feature",
      stacking: true,
    });
  });

  it("shows used/remaining/granted stats with the periods-aware label", () => {
    const tree = render();
    const stats = findAll(tree, "StatisticsItem");
    expect(stats.map((s) => [s.label, s.number])).toEqual([
      ["Used (last 3 billing periods)", 85],
      ["Remaining", 4915],
      ["Granted", 5000],
    ]);
  });

  it("drops the balance stats for legacy installs (nulls)", () => {
    const tree = render({
      data: { series: PAYLOAD.series, used_in_window: 3, granted: null, remaining: null },
    });
    const stats = findAll(tree, "StatisticsItem");
    expect(stats.map((s) => s.label)).toEqual(["Used (last 3 billing periods)"]);
  });

  it("showStats=false renders no Statistics tile (the internal card has its own)", () => {
    const tree = render({ showStats: false });
    expect(findAll(tree, "StatisticsItem")).toHaveLength(0);
    expect(findAll(tree, "BarChart")).toHaveLength(1);
  });

  it("empty series renders the empty state, not a chart", () => {
    const tree = render({ data: { series: [], used_in_window: 0 } });
    expect(findAll(tree, "BarChart")).toHaveLength(0);
    const empty = findAll(tree, "EmptyState");
    expect(empty).toHaveLength(1);
    expect(empty[0].title).toBe("No usage in this window");
    expect(textOf(empty[0])).toContain("Try a longer lookback");
  });
});

// AppHome's usageExplorer swap — ATS Home replaces the fixed last-vs-current
// PeriodComparison with the billing-period explorer (Jasper 2026-10-14).
// shallowResolve because AppHome's InstallProgress child is hookful.
describe("AppHome usageExplorer swap", () => {
  const cockpit = {
    app: { name: "Applicant Tracking System", app_key: "applicant_tracking_system" },
    activation: { status: "completed", complete: true, step: 5, total: 5, warnings: [] },
    health: { level: "healthy", reasons: [] },
    onboarding: {
      complete: true,
      steps: [
        { key: "install", label: "Install", done: true },
        { key: "plan", label: "Choose a plan", done: true, cta_route: "/billing" },
      ],
    },
    nudges: [],
    state: { period_comparison: { periods: [] } },
  };

  it("renders PeriodComparison by default", () => {
    const tree = renderShallow(AppHome, { state: cockpit });
    expect(findAll(tree, "PeriodComparison")).toHaveLength(1);
    expect(findAll(tree, "BillingPeriodUsage")).toHaveLength(0);
  });

  it("swaps in BillingPeriodUsage when usageExplorer is provided", () => {
    const usageExplorer = {
      context: { portal: { id: 42 }, variables: {} },
      basePath: "/v1/usage",
      portalId: 42,
    };
    const tree = renderShallow(AppHome, { state: cockpit, usageExplorer });
    expect(findAll(tree, "PeriodComparison")).toHaveLength(0);
    const nodes = findAll(tree, "BillingPeriodUsage");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].basePath).toBe("/v1/usage");
    expect(nodes[0].showStats).toBe(false);
    expect(nodes[0].title).toBe("Usage over time");
  });
});
