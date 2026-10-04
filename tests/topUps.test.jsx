// SDK tests for the base-service top-up endpoints + the pure top-up history
// table rendering. hubspot.fetch is the shared mock from
// ./helpers/uiExtensionsMock.js.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("@hubspot/ui-extensions", async () => {
  return await import("./helpers/uiExtensionsMock.js");
});

import { hubspot } from "@hubspot/ui-extensions";
import { getInvoices, getTopUps, setBillingLimit } from "../src/sdk/app/topUps";
import {
  InvoiceHistoryTable,
  TopUpHistoryTable,
  CreditsBilling,
} from "../src/billing/BillingTab";
import {
  renderComponent,
  renderShallow,
  findAll,
  textOf,
} from "./helpers/render.js";

const context = { variables: { BASE_URL: "https://base.example.com" } };
const BILLING_BASE = "https://billing.example.com";

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

describe("getInvoices", () => {
  it("GETs the BILLING service's invoices route with the action token (not base)", async () => {
    hubspot.fetch.mockResolvedValue(
      okJson({
        invoices: [
          {
            id: "in_1",
            date: "2026-09-01T00:00:00+00:00",
            description: "1 × Starter (at $29.00 / month) (Sep 1 – Oct 1, 2026)",
            amount_cents: 2900,
            currency: "usd",
            status: "paid",
            hosted_invoice_url: "https://invoice.stripe.com/i/in_1",
            kind: null,
          },
        ],
      })
    );
    const res = await getInvoices({
      billingBaseUrl: BILLING_BASE,
      token: "signed-action-token",
    });
    // The billing service (growth-ops-apps-app), NOT context.variables.BASE_URL.
    expect(hubspot.fetch).toHaveBeenCalledWith(
      "https://billing.example.com/v1/billing/invoices?token=signed-action-token",
      expect.objectContaining({ method: "GET" })
    );
    expect(res.invoices).toHaveLength(1);
  });

  it("URL-encodes the token query param", async () => {
    hubspot.fetch.mockResolvedValue(okJson({ invoices: [] }));
    await getInvoices({ billingBaseUrl: BILLING_BASE, token: "tok en/+with=specials" });
    const [url] = hubspot.fetch.mock.calls[0];
    expect(url).toContain("token=tok%20en%2F%2Bwith%3Dspecials");
  });

  it("surfaces FastAPI detail strings on failure, with the status code", async () => {
    hubspot.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: "Invalid or expired billing action token." }),
    });
    await expect(
      getInvoices({ billingBaseUrl: BILLING_BASE, token: "expired" })
    ).rejects.toThrow("Invalid or expired billing action token.");
  });

  it("a 404 carries statusCode 404 (the pre-invoices-route degradation the UI hides on)", async () => {
    hubspot.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ detail: "Not Found" }),
    });
    const err = await getInvoices({ billingBaseUrl: BILLING_BASE, token: "t" }).catch(
      (e) => e
    );
    expect(err.statusCode).toBe(404);
  });
});

describe("InvoiceHistoryTable", () => {
  const invoices = [
    {
      id: "in_2",
      date: "2026-10-01T00:00:00+00:00",
      description: "1 × Starter (at $29.00 / month) (Sep 1 – Oct 1, 2026)",
      amount_cents: 2900,
      currency: "usd",
      status: "paid",
      hosted_invoice_url: "https://invoice.stripe.com/i/in_2",
      kind: null,
    },
    {
      id: "in_1",
      date: "2026-09-20T14:03:00+00:00",
      description: "Line Item Assistant — 1,000 credit top-up",
      amount_cents: 2900,
      currency: "usd",
      status: "void",
      hosted_invoice_url: null,
      kind: "credit_top_up",
    },
  ];

  it("renders each invoice with date, description, amount, status, and receipt link", () => {
    const tree = renderComponent(InvoiceHistoryTable, { invoices });
    const rows = findAll(tree, "TableRow");
    expect(rows).toHaveLength(3); // header + 2 invoices
    const text = textOf(tree);
    expect(text).toContain("Oct 1, 2026");
    expect(text).toContain("1 × Starter (at $29.00 / month) (Sep 1 – Oct 1, 2026)");
    expect(text).toContain("Line Item Assistant — 1,000 credit top-up");
    expect(text).toContain("$29");
    expect(text).toContain("Paid");
    // The VOIDED top-up stays visible, labeled — the decline story.
    expect(text).toContain("Void");
    // Receipt links out to the hosted invoice; the voided row has no URL.
    const links = findAll(tree, "Link");
    expect(links).toHaveLength(1);
    expect(links[0].href).toEqual({
      url: "https://invoice.stripe.com/i/in_2",
      external: true,
    });
  });

  it("renders an em dash when an invoice has no hosted receipt URL", () => {
    const tree = renderComponent(InvoiceHistoryTable, { invoices });
    // in_1 (voided, no URL) renders "—" in the receipt cell instead of a Link.
    const text = textOf(tree);
    expect(text).toContain("—");
    expect(findAll(tree, "Link")).toHaveLength(1);
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

  it("renders history + invoices + limit for billing_model 'topup', wiring limit + token", () => {
    const tree = renderShallow(CreditsBilling, {
      context: ctx,
      state: paidCreditsState(),
      appKey: "hubspot_line_item",
    });
    expect(findAll(tree, "TopUpHistory")).toHaveLength(1);
    // Invoice history sits directly below Top-up history, fed by the billing
    // service base URL + the (interval-refreshed) portal action token.
    const history = findAll(tree, "InvoiceHistory");
    expect(history).toHaveLength(1);
    expect(history[0].billingBaseUrl).toBe("https://billing.example.com");
    expect(history[0].billingActionToken).toBe("signed-token");
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

  it("hides all three sections for billing_model 'metered' (threshold_state present)", () => {
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
    expect(findAll(tree, "InvoiceHistory")).toHaveLength(0);
    expect(findAll(tree, "BillingLimitControl")).toHaveLength(0);
  });

  it("hides all three sections when billing_model is absent (older backend)", () => {
    const state = paidCreditsState();
    delete state.entitlement.billing_model;
    const tree = renderShallow(CreditsBilling, {
      context: ctx,
      state,
      appKey: "hubspot_line_item",
    });
    expect(findAll(tree, "TopUpHistory")).toHaveLength(0);
    expect(findAll(tree, "InvoiceHistory")).toHaveLength(0);
    expect(findAll(tree, "BillingLimitControl")).toHaveLength(0);
  });
});
