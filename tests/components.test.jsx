// Component render tests for the hook-free components (CreditMeter,
// BillingBanner). @hubspot/ui-extensions is mocked with marker factories, so
// rendering = calling the component and walking the resolved tree.
import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@hubspot/ui-extensions", async () => {
  return await import("./helpers/uiExtensionsMock.js");
});

import { CreditMeter } from "../src/home/CreditMeter";
import { BillingBanner } from "../src/billing/BillingBanner";
import { renderComponent, findAll, textOf } from "./helpers/render.js";

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

const topupWithBank = (over = {}) => ({
  mode: "credits",
  entitled: true,
  granted: 1700,
  used: 0,
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

describe("CreditMeter", () => {
  it("renders nothing without credit data", () => {
    expect(CreditMeter({ entitlement: null, creditMeter: null })).toBe(null);
  });

  it("renders EXACTLY the single-segment bar when there is no bank", () => {
    const tree = renderComponent(CreditMeter, { entitlement: legacyFree() });
    const bars = findAll(tree, "ProgressBar");
    expect(bars).toHaveLength(1);
    expect(bars[0].title).toBe("37 used");
    expect(bars[0].value).toBe(37);
    expect(bars[0].maxValue).toBe(100);
    expect(textOf(tree)).toContain("63 of 100 credits left");
    expect(textOf(tree)).not.toContain("expire");
    const tag = findAll(tree, "StatusTag")[0];
    expect(tag.children).toBe("Healthy");
    expect(tag.variant).toBe("success");
  });

  it("renders stacked bars post-reset: pool depletion meter + text-only bank when granted is unknown", () => {
    const tree = renderComponent(CreditMeter, { entitlement: topupWithBank() });
    const bars = findAll(tree, "ProgressBar");
    // No top_up_bank_granted in the fixture → the bank degrades to a
    // text-only line (no bar, never "of 0").
    expect(bars).toHaveLength(1);
    expect(bars[0].title).toBe("0 of 1000 used");
    expect(bars[0].value).toBe(0);
    expect(bars[0].maxValue).toBe(1000);
    expect(bars[0].variant).toBe("success");
    const text = textOf(tree);
    // No combined headline — the combined denominator read as one big
    // confusing allowance.
    expect(text).not.toContain("1700 of 1700 credits left");
    expect(text).toContain("Monthly plan credits: 1000 of 1000 left");
    expect(text).toContain("Additional credits: 700 left");
    expect(text).toContain("Additional credits don't expire.");
  });

  it("renders the bank bar as a remaining-level gauge when top_up_bank_granted is present", () => {
    const tree = renderComponent(CreditMeter, {
      entitlement: topupWithBank({ top_up_bank_granted: 1700 }),
    });
    const bars = findAll(tree, "ProgressBar");
    expect(bars).toHaveLength(2);
    // Pool — depletion meter over the period grant. 0% used -> success.
    expect(bars[0].title).toBe("0 of 1000 used");
    expect(bars[0].maxValue).toBe(1000);
    expect(bars[0].variant).toBe("success");
    // Bank — level gauge: value is REMAINING (refills on purchase), colored by
    // ITS OWN level: 700/1700 = 41% full -> warning (20–50% band), NOT the
    // old hardcoded success.
    expect(bars[1].title).toBe("700 of 1700 left");
    expect(bars[1].value).toBe(700);
    expect(bars[1].maxValue).toBe(1700);
    expect(bars[1].variant).toBe("warning");
    expect(textOf(tree)).toContain("Additional credits (never expire): 700 of 1700 left");
  });

  it("colors each bar by its own fill level, not the account state", () => {
    // Jasper's case: pool 96% used with a FULL bank — the account is Healthy
    // (success tag) but the pool bar must be danger and the bank bar success.
    // Combined numbers: granted = pool 1000 + bank remaining 1000 = 2000,
    // remaining = pool 40 + bank 1000 = 1040, used 960.
    const tree = renderComponent(CreditMeter, {
      entitlement: topupWithBank({
        granted: 2000,
        remaining: 1040,
        used: 960,
        top_up_bank_remaining: 1000,
        top_up_bank_granted: 1000,
      }),
    });
    const tag = findAll(tree, "StatusTag")[0];
    expect(tag.children).toBe("Healthy");
    expect(tag.variant).toBe("success");
    const bars = findAll(tree, "ProgressBar");
    expect(bars[0].variant).toBe("danger"); // pool: 960/1000 = 96% used
    expect(bars[1].variant).toBe("success"); // bank: 1000/1000 = full
  });

  it("pins the bank gauge ladder at the component level (50% warning, 20% danger)", () => {
    const bankVariant = (bankRemaining) => {
      const tree = renderComponent(CreditMeter, {
        entitlement: topupWithBank({
          granted: 1000 + bankRemaining,
          remaining: 1000 + bankRemaining,
          used: 0,
          top_up_bank_remaining: bankRemaining,
          top_up_bank_granted: 1000,
        }),
      });
      return findAll(tree, "ProgressBar")[1].variant;
    };
    expect(bankVariant(510)).toBe("success"); // >50% full
    expect(bankVariant(500)).toBe("warning"); // 50% — top of the warning band
    expect(bankVariant(210)).toBe("warning"); // 21% — still warning
    expect(bankVariant(200)).toBe("danger"); // 20% — "running out"
  });

  it("pins the pool depletion ladder at the component level (80% warning, 95% danger)", () => {
    // The no-bank legacy single bar follows the same ratio rule.
    const singleVariant = (used) => {
      const tree = renderComponent(CreditMeter, {
        entitlement: legacyFree({ granted: 100, used, remaining: 100 - used }),
      });
      return findAll(tree, "ProgressBar")[0].variant;
    };
    expect(singleVariant(79)).toBe("success");
    expect(singleVariant(80)).toBe("warning");
    expect(singleVariant(94)).toBe("warning");
    expect(singleVariant(95)).toBe("danger");
  });

  it("collapses to the single pool bar when the bank is spent (bankRemaining 0)", () => {
    const tree = renderComponent(CreditMeter, {
      entitlement: topupWithBank({
        granted: 1000,
        used: 300,
        remaining: 700,
        top_up_bank_remaining: 0,
        top_up_bank_granted: 1000,
      }),
    });
    const bars = findAll(tree, "ProgressBar");
    expect(bars).toHaveLength(1);
    expect(bars[0].title).toBe("300 used");
    expect(bars[0].maxValue).toBe(1000);
    const text = textOf(tree);
    expect(text).toContain("700 of 1000 credits left");
    expect(text).not.toContain("Additional credits");
  });

  it("shows the blocking depleted state for a topup paid account at true zero", () => {
    const tree = renderComponent(CreditMeter, {
      entitlement: topupWithBank({
        granted: 1000,
        used: 1000,
        remaining: 0,
        top_up_bank_remaining: 0,
        threshold_state: "depleted",
        depleted: true,
        entitled: false,
      }),
    });
    const tag = findAll(tree, "StatusTag")[0];
    expect(tag.children).toBe("Depleted");
    const alerts = findAll(tree, "Alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].variant).toBe("error");
    expect(textOf(alerts[0])).toContain(
      "Actions are paused until your next billing period or a successful top-up."
    );
  });

  it("does NOT block a metered paid account in overage (2026-09-02)", () => {
    const tree = renderComponent(CreditMeter, {
      entitlement: {
        mode: "credits",
        entitled: true,
        granted: 1000,
        used: 1200,
        remaining: 0,
        low_threshold: 100,
        depleted: false,
        over_included: true,
        plan: "starter",
        top_up_bank_remaining: 0,
        last_top_up_at: null,
        threshold_state: "healthy",
      },
    });
    const tag = findAll(tree, "StatusTag")[0];
    expect(tag.children).toBe("Over included");
    expect(tag.variant).toBe("warning");
    expect(textOf(tree)).not.toContain("Depleted");
  });
});

describe("BillingBanner", () => {
  const stateFor = (entitlement, stateOver = {}) => ({
    entitlement,
    billing_base_url: "https://billing.example.com",
    billing_action_tokens: { portal: "signed-token" },
    app_id: "31489633",
    ...stateOver,
  });
  const context = { portal: { id: 12345 } };

  it("renders nothing for a healthy account", () => {
    expect(BillingBanner({ state: stateFor(topupWithBank()) })).toBe(null);
  });

  it("top_up_pending -> calm info banner, no button", () => {
    const tree = renderComponent(BillingBanner, {
      state: stateFor(topupWithBank({ threshold_state: "top_up_pending" })),
      onNavigate: () => {},
    });
    const alert = findAll(tree, "Alert")[0];
    expect(alert.variant).toBe("info");
    expect(alert.title).toBe("Adding credits automatically");
    expect(findAll(tree, "Button")).toHaveLength(0);
  });

  it("top_up_failed -> error banner linking to the billing portal", () => {
    const tree = renderComponent(BillingBanner, {
      state: stateFor(topupWithBank({ threshold_state: "top_up_failed" })),
      actionsNoun: "file actions",
      context,
      onNavigate: () => {},
    });
    const alert = findAll(tree, "Alert")[0];
    expect(alert.variant).toBe("error");
    expect(alert.title).toBe("We couldn't add credits");
    const buttons = findAll(tree, "Button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].children).toBe("Update payment method");
    expect(buttons[0].href.external).toBe(true);
    expect(buttons[0].href.url).toBe(
      "https://billing.example.com/v1/billing/portal/start" +
        "?token=signed-token" +
        `&return_url=${encodeURIComponent(
          "https://app.hubspot.com/app/12345/31489633/billing"
        )}`
    );
  });

  it("top_up_failed without a portal token falls back to the Billing tab", () => {
    const onNavigate = vi.fn();
    const tree = renderComponent(BillingBanner, {
      state: stateFor(topupWithBank({ threshold_state: "top_up_failed" }), {
        billing_action_tokens: null,
      }),
      onNavigate,
    });
    const buttons = findAll(tree, "Button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].children).toBe("Go to Billing →");
    buttons[0].onClick();
    expect(onNavigate).toHaveBeenCalledWith("/billing");
  });

  it("limit_reached -> warning banner with a raise-limit CTA into Billing", () => {
    const onNavigate = vi.fn();
    const tree = renderComponent(BillingBanner, {
      state: stateFor(topupWithBank({ threshold_state: "limit_reached" })),
      onNavigate,
    });
    const alert = findAll(tree, "Alert")[0];
    expect(alert.variant).toBe("warning");
    expect(alert.title).toBe("Billing limit reached");
    const buttons = findAll(tree, "Button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].children).toBe("Raise your billing limit");
    buttons[0].onClick();
    expect(onNavigate).toHaveBeenCalledWith("/billing");
  });

  it("depleted paid topup -> blocking error wording", () => {
    const tree = renderComponent(BillingBanner, {
      state: stateFor(
        topupWithBank({
          threshold_state: "depleted",
          depleted: true,
          entitled: false,
          remaining: 0,
          top_up_bank_remaining: 0,
        })
      ),
      actionsNoun: "task actions",
      onNavigate: () => {},
    });
    const alert = findAll(tree, "Alert")[0];
    expect(alert.variant).toBe("error");
    expect(textOf(alert)).toContain(
      "Your task actions are paused until your next billing period or a successful top-up."
    );
  });

  it("legacy free depleted -> unchanged blocking banner", () => {
    const tree = renderComponent(BillingBanner, {
      state: stateFor(legacyFree({ remaining: 0, used: 100, depleted: true })),
      actionLabel: "attaching and updating files",
      onNavigate: () => {},
    });
    const alert = findAll(tree, "Alert")[0];
    expect(alert.variant).toBe("error");
    expect(alert.title).toBe("You're out of credits");
    expect(textOf(alert)).toContain(
      "Your credits are used up. Choose a plan in Billing to keep attaching and updating files."
    );
    expect(findAll(tree, "Button")[0].children).toBe("Go to Billing →");
  });

  it("suppresses the in-app billing CTA when currentPath is /billing", () => {
    const tree = renderComponent(BillingBanner, {
      state: stateFor(topupWithBank({ threshold_state: "limit_reached" })),
      onNavigate: () => {},
      currentPath: "/billing",
    });
    const alert = findAll(tree, "Alert")[0];
    // Banner text stays — it's still informative on the Billing page.
    expect(alert.title).toBe("Billing limit reached");
    expect(findAll(tree, "Button")).toHaveLength(0);
  });

  it("keeps the in-app billing CTA on other paths", () => {
    const onNavigate = vi.fn();
    const tree = renderComponent(BillingBanner, {
      state: stateFor(topupWithBank({ threshold_state: "limit_reached" })),
      onNavigate,
      currentPath: "/home",
    });
    const buttons = findAll(tree, "Button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].children).toBe("Raise your billing limit");
    buttons[0].onClick();
    expect(onNavigate).toHaveBeenCalledWith("/billing");
  });

  it("does NOT suppress the external portal CTA on /billing", () => {
    const tree = renderComponent(BillingBanner, {
      state: stateFor(topupWithBank({ threshold_state: "top_up_failed" })),
      context,
      onNavigate: () => {},
      currentPath: "/billing",
    });
    const buttons = findAll(tree, "Button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].children).toBe("Update payment method");
    expect(buttons[0].href.external).toBe(true);
    expect(buttons[0].href.url).toContain("/v1/billing/portal/start");
  });

  it("omitted currentPath -> legacy behavior (button always rendered)", () => {
    const onNavigate = vi.fn();
    const tree = renderComponent(BillingBanner, {
      state: stateFor(topupWithBank({ threshold_state: "limit_reached" })),
      onNavigate,
    });
    const buttons = findAll(tree, "Button");
    expect(buttons).toHaveLength(1);
    buttons[0].onClick();
    expect(onNavigate).toHaveBeenCalledWith("/billing");
  });

  it("suppresses the legacy 'Go to Billing →' CTA on /billing", () => {
    const tree = renderComponent(BillingBanner, {
      state: stateFor(legacyFree({ remaining: 0, used: 100, depleted: true })),
      actionLabel: "attaching and updating files",
      onNavigate: () => {},
      currentPath: "/billing",
    });
    const alert = findAll(tree, "Alert")[0];
    expect(alert.title).toBe("You're out of credits");
    expect(findAll(tree, "Button")).toHaveLength(0);
  });

  it("legacy paid overage -> unchanged calm warning, never blocking", () => {
    const tree = renderComponent(BillingBanner, {
      state: stateFor(
        legacyFree({
          plan: "starter",
          granted: 1000,
          used: 1200,
          remaining: 0,
          over_included: true,
        })
      ),
      onNavigate: () => {},
    });
    const alert = findAll(tree, "Alert")[0];
    expect(alert.variant).toBe("warning");
    expect(alert.title).toBe("You've used your included credits");
  });
});
