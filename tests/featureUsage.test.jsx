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
      { key: "a", name: "A", credits: 3 },
      { key: "b", name: "B", credits: 0 },
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
