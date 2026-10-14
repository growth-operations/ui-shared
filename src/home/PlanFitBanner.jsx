import React from "react";
import { Box, Text, Alert } from "@hubspot/ui-extensions";
import { planFitOf } from "../lib/homeBlocks";

// The plan-fit savings banner: when state.plan_fit.verdict is
// "upgrade_recommended", tell the customer what staying on their current tier
// is costing them ("You could save $X/mo by moving to Professional — you
// bought 3 additional credit packs this period."). The right_plan verdict is
// NOT a banner — it reinforces the healthy hero instead (HealthHero reads
// state.plan_fit directly). Copy assembly lives in ../lib/homeBlocks
// (unit-tested), including the degraded phrasings when the backend can't
// price the savings yet.
//
// Renders nothing when the block is absent or the verdict isn't
// upgrade_recommended.
export function PlanFitBanner({ state }) {
  // planFitOf dual-reads payload.state.plan_fit (base) ?? payload.plan_fit
  // (self-hosted) — a top-level-only read left this banner dead on every
  // base-hosted app (found 2026-10-13).
  const fit = planFitOf(state);
  if (!fit || fit.kind !== "upgrade_recommended") return null;

  return (
    <Alert title="You could save on a higher plan" variant="warning">
      <Box flex="auto">
        <Text>{fit.text}</Text>
      </Box>
    </Alert>
  );
}

export default PlanFitBanner;
