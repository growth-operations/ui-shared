import React from "react";
import { Flex, Tile, Text, ProgressBar, StatusTag, Alert } from "@hubspot/ui-extensions";
import { daysUntil } from "../lib/format";

// THE credit-archetype activity tile + hero signal. For credit apps, "credits
// remaining" is the primary glanceable signal the way "trial days left" is for
// big apps. Driven by the entitlement union (mode === "credits") and/or the
// `credit_meter` block (CONTRACT.md). Renders nothing when there is no credit
// data to show.
//
// Numbers resolve from the credit_meter block first (richer: carries `recent`),
// then fall back to the entitlement arm. Thresholds (low_threshold, depleted,
// grant_expires_at) only live on the entitlement arm.
//
// Props:
//   entitlement  — the /v1/home entitlement union (uses the credits arm).
//   creditMeter  — the /v1/home credit_meter block (optional).
export function CreditMeter({ entitlement, creditMeter }) {
  const ent = entitlement?.mode === "credits" ? entitlement : null;
  const meter = creditMeter ?? null;
  if (!ent && !meter) return null;

  const granted = meter?.granted ?? ent?.granted ?? 0;
  const used = meter?.used ?? ent?.used ?? 0;
  const remaining = meter?.remaining ?? ent?.remaining ?? Math.max(granted - used, 0);

  const lowThreshold = ent?.low_threshold ?? 0;
  const depleted = ent?.depleted === true || remaining <= 0;
  const low = !depleted && remaining <= lowThreshold;

  // healthy green / low yellow / depleted red.
  const variant = depleted ? "error" : low ? "warning" : "success";
  const tagVariant = depleted ? "danger" : low ? "warning" : "success";
  const tagLabel = depleted ? "Depleted" : low ? "Running low" : "Healthy";

  const grantDaysLeft = ent?.grant_expires_at ? daysUntil(ent.grant_expires_at) : null;

  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Flex direction="row" gap="small" align="center">
          <Text format={{ fontWeight: "bold" }}>Credits</Text>
          <StatusTag variant={tagVariant}>{tagLabel}</StatusTag>
        </Flex>

        {/* PRIMARY signal — large and obvious. */}
        <Text format={{ fontWeight: "bold", fontSize: "lg" }}>
          {remaining} of {granted} credits left
        </Text>

        <ProgressBar
          title={`${used} used`}
          value={used}
          maxValue={granted > 0 ? granted : 1}
          showPercentage={true}
        />

        {/* Free-grant countdown: "100 free credits — N days left". */}
        {ent?.grant_expires_at && grantDaysLeft != null && (
          <Text format={{ fontStyle: "italic" }}>
            {granted} free credits —{" "}
            {grantDaysLeft <= 0
              ? "grant expired"
              : `${grantDaysLeft} day${grantDaysLeft === 1 ? "" : "s"} left`}
          </Text>
        )}

        {(depleted || low) && (
          <Alert
            title={depleted ? "You're out of credits" : "Running low on credits"}
            variant={variant}
          >
            <Text>
              {depleted
                ? "Pick a plan or buy more credits to keep going."
                : "You're getting close to your limit — pick a plan to top up."}
            </Text>
          </Alert>
        )}
      </Flex>
    </Tile>
  );
}

export default CreditMeter;
