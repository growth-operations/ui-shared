// The BillingTab canceled-state empty-catalog restart fallback (2026-10-13
// sparkfly incident): a catalog data gap leaves `plans: []`, the picker gate
// hides the grid, and the copy promised a grid that isn't there. The recovery
// path is the price_id-less one-click restart (the billing service resolves
// the account's last subscription price server-side).
//
// TrialSubscriptionBilling + StatusPanel are hook-free; PlanGrid (hooks) is
// shallow-wrapped as a marker, never invoked.
import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@hubspot/ui-extensions", async () => {
  return await import("./helpers/uiExtensionsMock.js");
});

import {
  TrialSubscriptionBilling,
  StatusPanel,
} from "../src/billing/BillingTab";
import {
  renderComponent,
  renderShallow,
  findAll,
  textOf,
} from "./helpers/render.js";

const ctx = { portal: { id: 12345 } };

const canceledState = (entitlementOver = {}, stateOver = {}) => ({
  entitlement: {
    mode: "trial_subscription",
    entitled: false,
    status: "canceled",
    trial_ends_at: null,
    current_period_end: "2026-09-01T00:00:00Z",
    cancel_at_period_end: false,
    ...entitlementOver,
  },
  billing_base_url: "https://billing.example.com",
  billing_action_tokens: { portal: "signed-token", restart: "restart-token" },
  app_id: "31489633",
  plans: [],
  ...stateOver,
});

const RESTART_URL =
  "https://billing.example.com/v1/billing/restart/start" +
  "?token=restart-token" +
  `&return_url=${encodeURIComponent(
    "https://app.hubspot.com/app/12345/31489633/billing"
  )}`;

describe("TrialSubscriptionBilling — canceled + empty catalog", () => {
  it("renders the standalone 'Restart your previous plan' button with a price_id-less URL", () => {
    const tree = renderShallow(TrialSubscriptionBilling, {
      context: ctx,
      state: canceledState(),
      appKey: "hubspot_sparkfly",
    });
    const buttons = findAll(tree, "Button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].children).toBe("Restart your previous plan");
    expect(buttons[0].variant).toBe("primary");
    expect(buttons[0].href.external).toBe(true);
    expect(buttons[0].href.url).toBe(RESTART_URL);
    // The whole point: NO price_id — the backend resolves the last price.
    expect(buttons[0].href.url).not.toContain("price_id");
    // No grid without a catalog…
    expect(findAll(tree, "PlanGrid")).toHaveLength(0);
    // …and the panel + helper line stop promising one ("below" is gone).
    const panel = findAll(tree, "StatusPanel")[0];
    expect(panel.plansAvailable).toBe(false);
    expect(panel.restartAvailable).toBe(true);
    const italic = findAll(tree, "Text").find(
      (t) => t.format?.fontStyle === "italic"
    );
    expect(textOf(italic)).not.toContain("Choose a plan below");
    expect(textOf(italic)).toContain("no checkout page");
  });

  it("no restart token -> no standalone button, Stripe-link copy (degrades like the keep-subscription button)", () => {
    const tree = renderShallow(TrialSubscriptionBilling, {
      context: ctx,
      state: canceledState({}, { billing_action_tokens: { portal: "signed-token" } }),
      appKey: "hubspot_sparkfly",
    });
    expect(findAll(tree, "Button")).toHaveLength(0);
    const panel = findAll(tree, "StatusPanel")[0];
    expect(panel.plansAvailable).toBe(false);
    expect(panel.restartAvailable).toBe(false);
    const italic = findAll(tree, "Text").find(
      (t) => t.format?.fontStyle === "italic"
    );
    expect(textOf(italic)).not.toContain("below");
  });

  it("legacy/Anvil-mode entitlement -> NO standalone button even canceled + empty + token", () => {
    // Defensive: BillingTab's mode switch routes mode "legacy" to
    // LegacyBilling, so TrialSubscriptionBilling is unreachable for legacy
    // installs — the explicit guard keeps it that way.
    const tree = renderShallow(TrialSubscriptionBilling, {
      context: ctx,
      state: canceledState({ mode: "legacy" }),
      appKey: "hubspot_sparkfly",
    });
    expect(
      findAll(tree, "Button").filter(
        (b) => b.children === "Restart your previous plan"
      )
    ).toHaveLength(0);
  });
});

describe("TrialSubscriptionBilling — canceled WITH a catalog (byte-identical to today)", () => {
  const plans = [
    {
      tier: "starter",
      name: "Starter",
      tier_order: 1,
      current: true,
      monthly: { price_id: "price_123", unit_amount: 2900, currency: "usd" },
      annual: null,
    },
  ];

  it("no standalone button; the grid renders as the resume path", () => {
    const tree = renderShallow(TrialSubscriptionBilling, {
      context: ctx,
      state: canceledState({}, { plans }),
      appKey: "hubspot_sparkfly",
    });
    expect(findAll(tree, "Button")).toHaveLength(0);
    const grids = findAll(tree, "PlanGrid");
    expect(grids).toHaveLength(1);
    expect(grids[0].resumeCurrentPlan).toBe(true);
    expect(grids[0].endpoint).toBe("checkout/start");
    const panel = findAll(tree, "StatusPanel")[0];
    expect(panel.plansAvailable).toBe(true);
    expect(panel.restartAvailable).toBe(false);
    const italic = findAll(tree, "Text").find(
      (t) => t.format?.fontStyle === "italic"
    );
    expect(textOf(italic)).toContain("Choose a plan below to resume.");
  });
});

describe("StatusPanel — canceled copy", () => {
  const ent = { mode: "trial_subscription", status: "canceled" };

  it("plans present -> byte-identical 'below' copy, no footer", () => {
    const tree = renderComponent(StatusPanel, { entitlement: ent });
    const text = textOf(tree);
    expect(text).toContain(
      "Restart your previous plan below in one click, or choose a different one — either way your data starts syncing again."
    );
    expect(text).not.toContain("Need help?");
  });

  it("empty catalog + restart available -> one-click copy without 'below', with the support footer", () => {
    const tree = renderComponent(StatusPanel, {
      entitlement: ent,
      plansAvailable: false,
      restartAvailable: true,
    });
    const text = textOf(tree);
    expect(text).toContain(
      "Restart your previous plan in one click — we charge your card on file and your data starts syncing again."
    );
    expect(text).not.toContain("below");
    expect(text).toContain("Need help? info@growthoperationsco.com");
  });

  it("empty catalog + NO restart token -> Stripe-link copy with the support footer", () => {
    const tree = renderComponent(StatusPanel, {
      entitlement: ent,
      plansAvailable: false,
      restartAvailable: false,
    });
    const text = textOf(tree);
    expect(text).toContain(
      "Manage your billing in Stripe with the link above to resume"
    );
    expect(text).not.toContain("below");
    expect(text).toContain("Need help? info@growthoperationsco.com");
  });
});
