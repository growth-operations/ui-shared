// Smoke test: the package root (and the SDK barrel) import cleanly and expose
// the new top-up surface. Catches broken imports/typos in files the
// behavioral tests don't touch (UsageTab, OptionSelect, sdk/token, ...).
import { describe, it, expect, vi } from "vitest";

vi.mock("@hubspot/ui-extensions", async () => {
  return await import("./helpers/uiExtensionsMock.js");
});

import * as root from "../src/index.js";

describe("package exports", () => {
  it("exposes the top-up SDK helpers and pure credit display logic", () => {
    expect(typeof root.getTopUps).toBe("function");
    expect(typeof root.setBillingLimit).toBe("function");
    expect(typeof root.resolveCreditMeter).toBe("function");
    expect(typeof root.resolveBillingBanner).toBe("function");
    expect(typeof root.parseLimitInput).toBe("function");
    expect(typeof root.hasTopUpBank).toBe("function");
  });

  it("keeps the pre-existing component exports", () => {
    for (const name of [
      "AppHome",
      "CreditMeter",
      "BillingTab",
      "BillingBanner",
      "PlanGrid",
      "SubscriptionGate",
    ]) {
      expect(typeof root[name], name).toBe("function");
    }
  });
});
