import React from "react";
import { Flex, Tile, Text, ProgressBar, StatusTag, Alert } from "@hubspot/ui-extensions";
import { daysUntil } from "../lib/format";
import { resolveCreditMeter } from "../lib/creditDisplay";

// THE credit-archetype activity tile + hero signal. For credit apps, "credits
// remaining" is the primary glanceable signal the way "trial days left" is for
// big apps. Driven by the entitlement union (mode === "credits") and/or the
// `credit_meter` block (CONTRACT.md). Renders nothing when there is no credit
// data to show.
//
// All branch math (number precedence, threshold_state → tag/alert, the
// pool+bank split) lives in ../lib/creditDisplay so it's unit-testable — this
// component is pure rendering.
//
// Two-segment bank display: accounts with a top-up bank (topup billing model)
// get the combined marker bar — `${used} of ${granted}` over the combined
// pool+bank denominator, so after a period reset with bank left it reads e.g.
// "0 of 1,700" while the bank segment shows what's left — plus the
// pool/bank breakdown lines. Accounts with NO bank (top_up_bank_remaining 0
// AND never a top-up) render exactly the legacy single-segment bar.
//
// Props:
//   entitlement  — the /v1/home entitlement union (uses the credits arm).
//   creditMeter  — the /v1/home credit_meter block (optional).
export function CreditMeter({ entitlement, creditMeter }) {
  const view = resolveCreditMeter(entitlement, creditMeter);
  if (!view) return null;

  const { granted, used, remaining, bank, tagVariant, tagLabel, alert } = view;
  const grantDaysLeft = view.grantExpiresAt ? daysUntil(view.grantExpiresAt) : null;

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

        {bank ? (
          <>
            {/* Current-position marker over the COMBINED pool+bank
                denominator (used = granted - remaining). The HubSpot
                ProgressBar is single-value, so the two segments are the
                labeled breakdown below; this bar is the position within the
                whole. */}
            <ProgressBar
              title={`${used} of ${granted} used`}
              value={used}
              maxValue={granted > 0 ? granted : 1}
              showPercentage={true}
            />
            <Flex direction="column" gap="extra-small">
              <Text>
                Monthly plan credits: {bank.poolRemaining} of {bank.poolGrant}{" "}
                left
              </Text>
              <Text>Additional credits: {bank.bankRemaining} left</Text>
              <Text format={{ fontStyle: "italic" }}>
                Additional credits don't expire.
              </Text>
            </Flex>
          </>
        ) : (
          <ProgressBar
            title={`${used} used`}
            value={used}
            maxValue={granted > 0 ? granted : 1}
            showPercentage={true}
          />
        )}

        {/* Free-grant countdown: "100 free credits — N days left". */}
        {view.grantExpiresAt && grantDaysLeft != null && (
          <Text format={{ fontStyle: "italic" }}>
            {granted} free credits —{" "}
            {grantDaysLeft <= 0
              ? "grant expired"
              : `${grantDaysLeft} day${grantDaysLeft === 1 ? "" : "s"} left`}
          </Text>
        )}

        {alert && (
          <Alert title={alert.title} variant={alert.variant}>
            <Text>{alert.message}</Text>
          </Alert>
        )}
      </Flex>
    </Tile>
  );
}

export default CreditMeter;
