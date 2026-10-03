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
import { TopUpHistoryTable } from "../src/billing/BillingTab";
import { renderComponent, findAll, textOf } from "./helpers/render.js";

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
  it("GETs the base app_pages top-ups route with portalId", async () => {
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
    });
    const [url, init] = hubspot.fetch.mock.calls[0];
    expect(url).toBe(
      "https://base.example.com/v1/hubspot/app_pages/hubspot_line_item/billing/limit?portalId=12345"
    );
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({ limit_cents: 5000 });
    expect(typeof init.body).toBe("object");
  });

  it("sends limit_cents: null to clear the cap", async () => {
    hubspot.fetch.mockResolvedValue(okJson({ limit_cents: null }));
    await setBillingLimit(context, {
      appKey: "hubspot_line_item",
      portalId: 12345,
      limitCents: null,
    });
    expect(hubspot.fetch.mock.calls[0][1].body).toEqual({ limit_cents: null });
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
