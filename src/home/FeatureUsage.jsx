import React from "react";
import { Flex, Tile, Text, Link } from "@hubspot/ui-extensions";
import { featureUsageOf } from "../lib/featureUsage";

// The Home "Most used features" / "Recommended to explore" sections, fed by
// the additive state.feature_usage block (per-app feature registry + credit
// ledger aggregation in growth-ops-apps-base).
//
// Composition: most-used first (what this install actually runs on), then
// the not-in-use catalog as "Recommended to explore" — each with its
// one-line rationale and setup-guide link. Each section renders only when it
// has rows, and the whole thing renders NOTHING when the block is absent
// (older backends, legacy installs) — absence is never an empty box.

function MostUsedTile({ mostUsed }) {
  if (mostUsed.length === 0) return null;
  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: "bold" }}>Most used features</Text>
        {mostUsed.map((f) => (
          <Flex key={f.key} direction="row" gap="small">
            <Text>{f.name}</Text>
            <Text variant="microcopy">
              {f.credits} {f.credits === 1 ? "credit" : "credits"}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Tile>
  );
}

function RecommendedTile({ notInUse }) {
  if (notInUse.length === 0) return null;
  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: "bold" }}>Recommended to explore</Text>
        {notInUse.map((f) => (
          <Flex key={f.key} direction="column" gap="extra-small">
            <Text format={{ fontWeight: "demibold" }}>{f.name}</Text>
            {f.rationale ? <Text>{f.rationale}</Text> : null}
            {f.docsUrl ? (
              <Link href={{ url: f.docsUrl, external: true }}>
                Read the guide →
              </Link>
            ) : null}
          </Flex>
        ))}
      </Flex>
    </Tile>
  );
}

export function FeatureUsage({ state }) {
  const view = featureUsageOf(state);
  if (!view) return null;
  return (
    <>
      <MostUsedTile mostUsed={view.mostUsed} />
      <RecommendedTile notInUse={view.notInUse} />
    </>
  );
}

export default FeatureUsage;
