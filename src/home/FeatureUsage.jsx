import React from "react";
import { Flex, Tile, Text, Link, Button } from "@hubspot/ui-extensions";
import {
  featureUsageOf,
  pickDailyRecommendations,
  recommendationsRotated,
} from "../lib/featureUsage";

// The Home "Most used features" / "Recommended to explore" sections, fed by
// the additive state.feature_usage block (per-app feature registry + credit
// ledger aggregation in growth-ops-apps-base).
//
// Composition: most-used first (what this install actually runs on), then
// the not-in-use catalog as "Recommended to explore" — each with its
// one-line rationale and (for super admins) its setup CTA links. Each
// section renders only when it has rows, and the whole thing renders NOTHING
// when the block is absent (older backends, legacy installs) — absence is
// never an empty box.

// Singular/plural label for a row's unit ("credits" | "events") — the wire
// field is credits_or_events, so an event-denominated feature must not be
// mislabeled as credits.
const unitLabel = (unit, count) => {
  const singular = unit === "events" ? "event" : "credit";
  return count === 1 ? singular : `${singular}s`;
};

function MostUsedTile({ mostUsed }) {
  if (mostUsed.length === 0) return null;
  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: "bold" }}>Most used features</Text>
        {mostUsed.map((f) => (
          // justify=between pins the count column flush-right so counts align
          // across rows regardless of feature-name length (Jasper 2026-10-13:
          // ragged gap-after-name read as broken alignment).
          <Flex key={f.key} direction="row" justify="between" align="baseline">
            <Text>{f.name}</Text>
            <Text variant="microcopy">
              {f.count} {unitLabel(f.unit, f.count)}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Tile>
  );
}

function RecommendedTile({ notInUse, isSuperAdmin, onNavigate }) {
  if (notInUse.length === 0) return null;
  // Long lists (ATS: 13 features) render as a rotating daily slice instead of
  // a wall — the whole list still arrives in the payload; the window is a
  // pure function of the UTC date (see ../lib/featureUsage).
  const picks = pickDailyRecommendations(
    notInUse,
    new Date().toISOString().slice(0, 10)
  );
  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: "bold" }}>Recommended to explore</Text>
        {picks.map((f) => {
          // Setup CTAs render for EVERYONE (1.29.0, Jasper 2026-10-14: "why
          // gate so much on super admin?"). The old blanket super-admin gate
          // assumed the targets were admin-only surfaces — but HubSpot
          // permissions are granular (CRM customization ≠ super admin), and
          // hiding the CTA kept non-admins from even knowing what to ask
          // their admin for. adminOnly items instead carry a "(Super Admin)"
          // hint for non-admin viewers, so the permission wall is never a
          // blind click. The adminOnly marker still distinguishes the two
          // surface kinds; old backends emit no marker → every item gets the
          // hint for non-admins (conservative, and matches the old gate's
          // assumption that the targets are admin surfaces).
          //
          // "Learn more →" (docs_url) intentionally NOT rendered (Jasper
          // 2026-10-14): every feature's docs_url points at the same single
          // setup guide — noise until per-feature articles exist. docs_url
          // stays in the wire contract; re-enabling is a one-line revert.
          const ctas = f.ctas;
          const hint = (c) =>
            c.adminOnly && !isSuperAdmin ? " (Super Admin)" : "";
          return (
            <Flex key={f.key} direction="column" gap="extra-small">
              <Text format={{ fontWeight: "demibold" }}>{f.name}</Text>
              {f.rationale ? <Text>{f.rationale}</Text> : null}
              {ctas.map((cta) =>
                cta.url ? (
                  <Link key={cta.label} href={{ url: cta.url, external: true }}>
                    {cta.label}
                    {hint(cta)} →
                  </Link>
                ) : onNavigate ? (
                  <Button
                    key={cta.label}
                    variant="secondary"
                    onClick={() => onNavigate(cta.route)}
                  >
                    {cta.label}
                    {hint(cta)}
                  </Button>
                ) : null
              )}
            </Flex>
          );
        })}
        {recommendationsRotated(notInUse) ? (
          <Text variant="microcopy">
            New picks daily — {notInUse.length} features to explore in all.
          </Text>
        ) : null}
      </Flex>
    </Tile>
  );
}

export function FeatureUsage({ state, onNavigate }) {
  const view = featureUsageOf(state);
  if (!view) return null;
  return (
    <>
      <MostUsedTile mostUsed={view.mostUsed} />
      <RecommendedTile
        notInUse={view.notInUse}
        isSuperAdmin={state?.user?.is_super_admin === true}
        onNavigate={onNavigate}
      />
    </>
  );
}

export default FeatureUsage;
