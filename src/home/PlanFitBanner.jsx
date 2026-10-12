import React from "react";
import { Text, Alert } from "@hubspot/ui-extensions";
import { resolvePlanFit } from "../lib/homeBlocks";

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
  const fit = resolvePlanFit(state?.plan_fit);
  if (!fit || fit.kind !== "upgrade_recommended") return null;

  return (
    <Alert title="You could save on a higher plan" variant="warning">
      <Text>{fit.text}</Text>
    </Alert>
  );
}

export default PlanFitBanner;
