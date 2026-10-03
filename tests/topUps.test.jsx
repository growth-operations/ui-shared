// SDK tests for the base-service top-up endpoints + the pure top-up history
// table rendering. hubspot.fetch is the shared mock from
// ./helpers/uiExtensionsMock.js.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("@hubspot/ui-extensions", async () => {
  return await import("./helpers/uiExtensionsMock.js");
});

import { hubspot } from "@hubspot/ui-extensions";
import { getTopUps, setBillingLimit } from "../src/sdk/app/topUps";
import { TopUpHistoryTable, CreditsBilling } from "../src/billing/BillingTab";
import {
  renderComponent,
  renderShallow,
  findAll,
  textOf,
} from "./helpers/render.js";

const context = { variables: { BASE_URL: "https://base.example.com" } };

const okJson = (data) => ({
  ok: true,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

beforeEach(() => {
  hubspot.fetch.mockReset();
});

describe("getTopUps", () => {
  it("GETs the base app_pages top-ups route with portalId (no action token)", async () => {
    hubspot.fetch.mockResolvedValue(
      okJson({
        top_ups: [
          { at: "2026-09-20T14:03:00Z", credits: 1000, price_cents: 2900, period_key: "2026-09" },
        ],
      })
    );
    const res = await getTopUps(context, {
      appKey: "hubspot_line_item",
      portalId: 12345,
    });
    expect(hubspot.fetch).toHaveBeenCalledWith(
      "https://base.example.com/v1/hubspot/app_pages/hubspot_line_item/billing/top-ups?portalId=12345",
      expect.objectContaining({ method: "GET" })
    );
    // The GET is verify_hubspot-only on the base side — no billing action
    // token rides along.
    expect(hubspot.fetch.mock.calls[0][0]).not.toContain("token=");
    expect(res.top_ups).toHaveLength(1);
  });
});

describe("setBillingLimit", () => {
  it("POSTs a plain-object body (never JSON.stringify'd) to set the cap", async () => {
    hubspot.fetch.mockResolvedValue(okJson({ limit_cents: 5000 }));
    await setBillingLimit(context, {
      appKey: "hubspot_line_item",
      portalId: 12345,
      limitCents: 5000,
      token: "signed-action-token",
    });
    const [url, init] = hubspot.fetch.mock.calls[0];
    expect(url).toBe(
      "https://base.example.com/v1/hubspot/app_pages/hubspot_line_item/billing/limit" +
        "?portalId=12345&token=signed-action-token"
    );
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({ limit_cents: 5000 });
    expect(typeof init.body).toBe("object");
  });

  it("sends the billing action token as a `token` QUERY param (URL-encoded)", async () => {
    // The base verifier reads token from Query, not headers/body — the POST
    // 401s without it. Verify it lands on the URL, encoded.
    hubspot.fetch.mockResolvedValue(okJson({ limit_cents: 5000 }));
    await setBillingLimit(context, {
      appKey: "hubspot_line_item",
      portalId: 12345,
      limitCents: 5000,
      token: "tok en/+with=specials",
    });
    const [url, init] = hubspot.fetch.mock.calls[0];
    // URLSearchParams (form encoding): space -> "+", the rest percent-encoded.
    expect(url).toContain("token=tok+en%2F%2Bwith%3Dspecials");
    expect(init.body).toEqual({ limit_cents: 5000 }); // token NOT in the body
  });

  it("omits the token param entirely when none is provided", async () => {
    hubspot.fetch.mockResolvedValue(okJson({ limit_cents: 5000 }));
    await setBillingLimit(context, {
      appKey: "hubspot_line_item",
      portalId: 12345,
      limitCents: 5000,
    });
    expect(hubspot.fetch.mock.calls[0][0]).toBe(
      "https://base.example.com/v1/hubspot/app_pages/hubspot_line_item/billing/limit?portalId=12345"
    );
  });

  it("sends limit_cents: null to clear the cap", async () => {
    hubspot.fetch.mockResolvedValue(okJson({ limit_cents: null }));
    await setBillingLimit(context, {
      appKey: "hubspot_line_item",
      portalId: 12345,
      limitCents: null,
      token: "signed-action-token",
    });
    expect(hubspot.fetch.mock.calls[0][1].body).toEqual({ limit_cents: null });
    expect(hubspot.fetch.mock.calls[0][0]).toContain("token=signed-action-token");
  });

  it("surfaces FastAPI detail strings on failure", async () => {
    hubspot.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ detail: "Limit must be positive" }),
    });
    await expect(
      setBillingLimit(context, { appKey: "hubspot_line_item", portalId: 1, limitCents: 5 })
    ).rejects.toThrow("Limit must be positive");
  });
});

describe("TopUpHistoryTable", () => {
  it("renders each purchase with date, credits, price, and the no-expiry note", () => {
    const tree = renderComponent(TopUpHistoryTable, {
      topUps: [
        { at: "2026-09-20T14:03:00Z", credits: 1000, price_cents: 2900, period_key: "2026-09" },
        { at: "2026-08-12T09:30:00Z", credits: 500, price_cents: 1500, period_key: "2026-08" },
      ],
    });
    const rows = findAll(tree, "TableRow");
    expect(rows).toHaveLength(3); // header + 2 purchases
    const text = textOf(tree);
    expect(text).toContain("Sep 20, 2026");
    expect(text).toContain("1000");
    expect(text).toContain("$29");
    expect(text).toContain("500");
    expect(text).toContain("$15");
    expect(text.match(/Does not expire/g)).toHaveLength(2);
    expect(text).toContain("Additional credits don't expire");
  });
});

// The BillingTab top-up sections are gated on the entitlement arm's
// billing_model discriminator (populated for all accounts on the current
// contract; absent on older backends — both non-topup cases hide the
// sections). CreditsBilling is hook-free, so it renders shallowly: hookful
// children (TopUpHistory/BillingLimitControl) are wrapped, not invoked.
describe("CreditsBilling top-up section gating", () => {
  const paidCreditsState = (entitlementOver = {}, stateOver = {}) => ({
    entitlement: {
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
      billing_model: "topup",
      billing_limit_cents: 5000,
      ...entitlementOver,
    },
    billing_base_url: "https://billing.example.com",
    billing_action_tokens: { portal: "signed-token" },
    app_id: "31489633",
    plans: [],
    ...stateOver,
  });
  const ctx = { portal: { id: 12345 } };

  it("renders history + limit for billing_model 'topup', wiring limit + token", () => {
    const tree = renderShallow(CreditsBilling, {
      context: ctx,
      state: paidCreditsState(),
      appKey: "hubspot_line_item",
    });
    expect(findAll(tree, "TopUpHistory")).toHaveLength(1);
    const controls = findAll(tree, "BillingLimitControl");
    expect(controls).toHaveLength(1);
    expect(controls[0].currentLimitCents).toBe(5000);
    expect(controls[0].billingActionToken).toBe("signed-token");
  });

  it("reads a cleared limit (billing_limit_cents null) as no cap", () => {
    const tree = renderShallow(CreditsBilling, {
      context: ctx,
      state: paidCreditsState({ billing_limit_cents: null }),
      appKey: "hubspot_line_item",
    });
    expect(findAll(tree, "BillingLimitControl")[0].currentLimitCents).toBe(null);
  });

  it("hides both sections for billing_model 'metered' (threshold_state present)", () => {
    const tree = renderShallow(CreditsBilling, {
      context: ctx,
      state: paidCreditsState({
        billing_model: "metered",
        top_up_bank_remaining: 0,
        last_top_up_at: null,
      }),
      appKey: "hubspot_line_item",
    });
    expect(findAll(tree, "TopUpHistory")).toHaveLength(0);
    expect(findAll(tree, "BillingLimitControl")).toHaveLength(0);
  });

  it("hides both sections when billing_model is absent (older backend)", () => {
    const state = paidCreditsState();
    delete state.entitlement.billing_model;
    const tree = renderShallow(CreditsBilling, {
      context: ctx,
      state,
      appKey: "hubspot_line_item",
    });
    expect(findAll(tree, "TopUpHistory")).toHaveLength(0);
    expect(findAll(tree, "BillingLimitControl")).toHaveLength(0);
  });
});
