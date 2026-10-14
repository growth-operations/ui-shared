// FeatureUsage: the Home "Most used features" / "Recommended to explore"
// sections (state.feature_usage) — resolver branch math plus render tests.
import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@hubspot/ui-extensions", async () => {
  return await import("./helpers/uiExtensionsMock.js");
});

import { FeatureUsage } from "../src/home/FeatureUsage";
import { AppHome } from "../src/home/AppHome";
import { resolveFeatureUsage, featureUsageOf } from "../src/lib/featureUsage";
import { renderComponent, shallowResolve, findAll, textOf } from "./helpers/render";

const block = (over = {}) => ({
  most_used: [
    { key: "geocode_record", name: "Geocode Records", credits_or_events: 42 },
    { key: "geofence_record", name: "Geofence Records", credits_or_events: 1 },
  ],
  not_in_use: [
    {
      key: "nearby_lists",
      name: "Nearby Lists",
      docs_url: "https://example.com/guide",
      rationale: "Build static lists of the records nearest to any location.",
    },
  ],
  ...over,
});

// ---------------------------------------------------------------------------
// resolveFeatureUsage
// ---------------------------------------------------------------------------

describe("resolveFeatureUsage", () => {
  it("returns null when the block is absent or malformed", () => {
    expect(resolveFeatureUsage(undefined)).toBeNull();
    expect(resolveFeatureUsage(null)).toBeNull();
    expect(resolveFeatureUsage("nope")).toBeNull();
    expect(resolveFeatureUsage({})).toBeNull(); // both lists absent -> nothing to say
  });

  it("returns null when both lists are empty", () => {
    expect(resolveFeatureUsage({ most_used: [], not_in_use: [] })).toBeNull();
  });

  it("maps the wire shape, dropping rows without key/name", () => {
    const view = resolveFeatureUsage(
      block({
        most_used: [
          { key: "a", name: "A", credits_or_events: 3 },
          { name: "no key" },
          null,
          { key: "b", name: "B" }, // no credits -> 0
        ],
      })
    );
    expect(view.mostUsed).toEqual([
      { key: "a", name: "A", count: 3, unit: "credits" },
      { key: "b", name: "B", count: 0, unit: "credits" },
    ]);
    expect(view.notInUse).toEqual([
      {
        key: "nearby_lists",
        name: "Nearby Lists",
        docsUrl: "https://example.com/guide",
        rationale: "Build static lists of the records nearest to any location.",
      },
    ]);
  });

  it("carries the row's unit hint, defaulting to credits", () => {
    const view = resolveFeatureUsage({
      most_used: [
        { key: "a", name: "A", credits_or_events: 3, unit: "events" },
        { key: "b", name: "B", credits_or_events: 1, unit: "event" }, // singular ok
        { key: "c", name: "C", credits_or_events: 2, unit: "credits" },
        { key: "d", name: "D", credits_or_events: 2, unit: "bogus" }, // -> credits
        { key: "e", name: "E", credits_or_events: 2 }, // absent -> credits
      ],
    });
    expect(view.mostUsed.map((f) => f.unit)).toEqual([
      "events",
      "events",
      "credits",
      "credits",
      "credits",
    ]);
  });

  it("tolerates missing docs_url / rationale on recommendations", () => {
    const view = resolveFeatureUsage({
      not_in_use: [{ key: "k", name: "K" }],
    });
    expect(view.notInUse).toEqual([
      { key: "k", name: "K", docsUrl: null, rationale: "" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// featureUsageOf (payload path)
// ---------------------------------------------------------------------------

describe("featureUsageOf", () => {
  it("reads the nested state.feature_usage block", () => {
    expect(featureUsageOf({ state: { feature_usage: block() } })).not.toBeNull();
  });

  it("falls back to a top-level feature_usage (inner-block callers)", () => {
    expect(featureUsageOf({ feature_usage: block() })).not.toBeNull();
  });

  it("returns null for missing payloads and absent blocks", () => {
    expect(featureUsageOf(null)).toBeNull();
    expect(featureUsageOf({})).toBeNull();
    expect(featureUsageOf({ state: {} })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FeatureUsage component
// ---------------------------------------------------------------------------

describe("FeatureUsage", () => {
  it("renders nothing when the block is absent (older backend / legacy)", () => {
    expect(renderComponent(FeatureUsage, { state: {} })).toBeNull();
    expect(renderComponent(FeatureUsage, { state: { state: {} } })).toBeNull();
  });

  it("renders most-used first, then recommendations", () => {
    const tree = renderComponent(FeatureUsage, {
      state: { state: { feature_usage: block() } },
    });
    const text = textOf(tree);
    expect(text.indexOf("Most used features")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Recommended to explore")).toBeGreaterThan(
      text.indexOf("Most used features")
    );
    expect(text).toContain("Geocode Records");
    expect(text).toContain("42 credits");
    expect(text).toContain("1 credit"); // singular
    expect(text).toContain("Nearby Lists");
    expect(text).toContain(
      "Build static lists of the records nearest to any location."
    );
  });

  it("labels event-denominated rows as events, not credits", () => {
    const tree = renderComponent(FeatureUsage, {
      state: {
        state: {
          feature_usage: {
            most_used: [
              { key: "a", name: "A", credits_or_events: 7, unit: "events" },
              { key: "b", name: "B", credits_or_events: 1, unit: "events" },
            ],
          },
        },
      },
    });
    const text = textOf(tree);
    expect(text).toContain("7 events");
    expect(text).toContain("1 event"); // singular
    expect(text).not.toContain("credit");
  });

  it("links each recommendation to its guide", () => {
    const tree = renderComponent(FeatureUsage, {
      state: { state: { feature_usage: block() } },
    });
    const links = findAll(tree, "Link");
    expect(links).toHaveLength(1);
    expect(links[0].href).toEqual({
      url: "https://example.com/guide",
      external: true,
    });
  });

  it("renders only the section that has rows", () => {
    const onlyRecommended = renderComponent(FeatureUsage, {
      state: { state: { feature_usage: block({ most_used: [] }) } },
    });
    expect(textOf(onlyRecommended)).not.toContain("Most used features");
    expect(textOf(onlyRecommended)).toContain("Recommended to explore");

    const onlyMostUsed = renderComponent(FeatureUsage, {
      state: { state: { feature_usage: block({ not_in_use: [] }) } },
    });
    expect(textOf(onlyMostUsed)).toContain("Most used features");
    expect(textOf(onlyMostUsed)).not.toContain("Recommended to explore");
  });

  it("omits the guide link and rationale when the backend has none", () => {
    const tree = renderComponent(FeatureUsage, {
      state: {
        state: {
          feature_usage: { most_used: [], not_in_use: [{ key: "k", name: "K" }] },
        },
      },
    });
    expect(findAll(tree, "Link")).toHaveLength(0);
    expect(textOf(tree)).toContain("K");
  });
});

// ---------------------------------------------------------------------------
// AppHome integration — the cockpit gate (post-setup-steps; the paid-gated
// plan step does NOT hold the sections back). AppHome's InstallProgress child
// uses hooks, so these go through shallowResolve and assert on the
// FeatureUsage node itself rather than its rendered text.
// ---------------------------------------------------------------------------

// Minimal activated-cockpit payload; the block lives at payload.state.feature_usage.
const cockpit = (over = {}) => ({
  app: { name: "Geocoding & Geofencing", app_key: "hubspot_geocoding" },
  activation: { status: "completed", complete: true, step: 5, total: 5, warnings: [] },
  health: { level: "healthy", reasons: [] },
  onboarding: {
    complete: true,
    steps: [
      { key: "install", label: "Install Geocoding", done: true },
      { key: "workflow", label: "Add a Geocode Record action to a workflow", done: true },
      { key: "plan", label: "Choose a plan", done: true, cta_route: "/billing" },
    ],
  },
  nudges: [],
  ...over,
});

describe("AppHome + FeatureUsage", () => {
  it("mounts FeatureUsage once onboarding is complete, fed the whole payload", () => {
    const payload = cockpit({ state: { feature_usage: block() } });
    const tree = shallowResolve(AppHome({ state: payload }));
    const nodes = findAll(tree, "FeatureUsage");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].state).toBe(payload);
  });

  it("mounts NO Home trial banner anymore — trial states fly in the top BillingBanner", () => {
    // Andrew 2026-10-13 consolidation: even with an active free trial in the
    // payload (previously the exact case that rendered <TrialBanner> above the
    // hero), Home mounts nothing — the one banner lives in the app layout.
    const tree = shallowResolve(
      AppHome({
        state: cockpit({
          entitlement: {
            mode: "credits",
            entitled: true,
            granted: 100,
            used: 10,
            remaining: 90,
            grant_expires_at: new Date(
              Date.now() + 12 * 24 * 60 * 60 * 1000
            ).toISOString(),
          },
        }),
      })
    );
    expect(findAll(tree, "TrialBanner")).toHaveLength(0);
    // …and the cockpit still renders around it.
    expect(findAll(tree, "HealthHero")).toHaveLength(1);
  });

  it("stays hidden while a non-billing setup step is unfinished, even with the block", () => {
    const tree = shallowResolve(
      AppHome({
        state: cockpit({
          onboarding: {
            complete: false,
            steps: [
              { key: "install", label: "Install Geocoding", done: true },
              {
                key: "workflow",
                label: "Add a Geocode Record action to a workflow",
                done: false,
              },
              { key: "plan", label: "Choose a plan", done: false, cta_route: "/billing" },
            ],
          },
          state: { feature_usage: block() },
        }),
      })
    );
    expect(findAll(tree, "FeatureUsage")).toHaveLength(0);
  });

  it("SHOWS the sections for a trial user — plan step open, other steps done", () => {
    // Every registry app marks Choose-a-plan done=on_paid, so gating on
    // onboarding.complete would hide FeatureUsage from free/trial installs
    // forever. The paid-gated step must not hold the sections back.
    const tree = shallowResolve(
      AppHome({
        state: cockpit({
          onboarding: {
            complete: false,
            steps: [
              { key: "install", label: "Install Geocoding", done: true },
              {
                key: "workflow",
                label: "Add a Geocode Record action to a workflow",
                done: true,
              },
              { key: "plan", label: "Choose a plan", done: false, cta_route: "/billing" },
            ],
          },
          state: { feature_usage: block() },
        }),
      })
    );
    expect(findAll(tree, "FeatureUsage")).toHaveLength(1);
  });

  it("treats a step routed to /billing as paid-gated even under another key", () => {
    const tree = shallowResolve(
      AppHome({
        state: cockpit({
          onboarding: {
            complete: false,
            steps: [
              { key: "install", label: "Install", done: true },
              { key: "upgrade", label: "Pick a plan", done: false, cta_route: "/billing" },
            ],
          },
          state: { feature_usage: block() },
        }),
      })
    );
    expect(findAll(tree, "FeatureUsage")).toHaveLength(1);
  });

  it("keeps the legacy block-level gate when the backend sends no step model", () => {
    // steps absent/empty -> fall back to onboarding.complete (old behavior).
    const incomplete = shallowResolve(
      AppHome({
        state: cockpit({
          onboarding: { complete: false, steps: [] },
          state: { feature_usage: block() },
        }),
      })
    );
    expect(findAll(incomplete, "FeatureUsage")).toHaveLength(0);

    const complete = shallowResolve(
      AppHome({
        state: cockpit({
          onboarding: { complete: true, steps: [] },
          state: { feature_usage: block() },
        }),
      })
    );
    expect(findAll(complete, "FeatureUsage")).toHaveLength(1);
  });
});

// --- Recommendation rotation (2026-10-13: the 13-feature ATS firehose) ------
import {
  pickDailyRecommendations,
  recommendationsRotated,
  rotationDayHash,
  RECOMMENDATION_PICK_COUNT,
  RECOMMENDATION_WHOLE_LIST_MAX,
} from "../src/lib/featureUsage";

const feature = (key) => ({ key, name: `Feature ${key}`, docsUrl: null, rationale: "" });
const listOf = (n) => Array.from({ length: n }, (_, i) => feature(`f${i}`));

describe("pickDailyRecommendations", () => {
  it("returns the whole list when it fits (small registries unchanged)", () => {
    for (const n of [0, 1, RECOMMENDATION_WHOLE_LIST_MAX]) {
      expect(pickDailyRecommendations(listOf(n), "2026-10-13")).toEqual(listOf(n));
    }
  });

  it("returns exactly PICK_COUNT items from a long list, in registry order", () => {
    // djb2("2026-10-13") % 13 === 2
    const picks = pickDailyRecommendations(listOf(13), "2026-10-13");
    expect(picks.map((f) => f.key)).toEqual(["f2", "f3", "f4"]);
    expect(picks).toHaveLength(RECOMMENDATION_PICK_COUNT);
  });

  it("is deterministic within a day and advances the window the next day", () => {
    const a = pickDailyRecommendations(listOf(13), "2026-10-14");
    const b = pickDailyRecommendations(listOf(13), "2026-10-14");
    expect(a).toEqual(b);
    // djb2 of consecutive date strings increments by 1 -> window slides by 1
    const next = pickDailyRecommendations(listOf(13), "2026-10-15");
    expect(next.map((f) => f.key)).toEqual(["f4", "f5", "f6"]);
  });

  it("wraps around the end of the list", () => {
    // djb2("2026-10-26") % 13 === 12 -> [12, 0, 1]
    const picks = pickDailyRecommendations(listOf(13), "2026-10-26");
    expect(picks.map((f) => f.key)).toEqual(["f12", "f0", "f1"]);
  });

  it("handles non-array input defensively", () => {
    expect(pickDailyRecommendations(null, "2026-10-13")).toEqual([]);
    expect(pickDailyRecommendations(undefined, "2026-10-13")).toEqual([]);
  });
});

describe("recommendationsRotated", () => {
  it("is true only when the list overflows the whole-list max", () => {
    expect(recommendationsRotated(listOf(RECOMMENDATION_WHOLE_LIST_MAX))).toBe(false);
    expect(recommendationsRotated(listOf(RECOMMENDATION_WHOLE_LIST_MAX + 1))).toBe(true);
    expect(recommendationsRotated(null)).toBe(false);
  });
});

describe("rotationDayHash", () => {
  it("is a stable unsigned 32-bit hash of the date string", () => {
    expect(rotationDayHash("2026-10-13")).toBe(2772548014);
    expect(rotationDayHash("2026-10-13")).toBe(rotationDayHash("2026-10-13"));
    expect(rotationDayHash("2026-10-13")).not.toBe(rotationDayHash("2026-10-14"));
  });
});
