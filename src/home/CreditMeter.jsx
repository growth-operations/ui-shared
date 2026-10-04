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
// All branch math (number precedence, threshold_state → tag/alert/bar
// variants, the pool+bank split) lives in ../lib/creditDisplay so it's
// unit-testable — this component is pure rendering.
//
// Stacked-bars bank display: an account with top-up bank credits left (topup
// billing model) gets TWO bars, one per bucket, and NO combined headline (the
// combined pool+bank denominator read as one big confusing allowance):
//   1. Monthly plan credits — a DEPLETION meter (value = pool used of the
//      period grant), colored by the POOL'S OWN fill level: success under
//      80% used, warning at >=80%, danger at >=95% (view.poolBarVariant —
//      mirrors the ~80/95 low-credit alert ladder).
//   2. Additional credits — a LEVEL gauge (value = bank remaining of the
//      bank's granted total: the bank is cumulative and never expires, so a
//      used-of-granted bar would drift to permanently-near-full over multiple
//      purchases; the remaining level refills on purchase and drains on
//      spend), colored by ITS OWN level: success above 50% full, warning at
//      <=50% (view.bankBarVariant). NO danger on this bar — HubSpot's
//      ProgressBar paints the whole track red in danger, so a low gauge
//      would read as FULL; at <=20% a warning "Running low" StatusTag rides
//      the line instead (bank.bankLow).
// Each bar colors by its own fill, NOT the account's threshold state — the
// StatusTag keeps the account-state colors. Hosts whose backend predates
// top_up_bank_granted degrade gracefully: the bank renders as a text-only
// line (no bar, never "of 0"). An account with NO bank credits left (never
// topped up, or the bank is spent) renders exactly the legacy view — the
// "{remaining} of {granted} credits left" headline plus the single
// fill-colored bar.
//
// Props:
//   entitlement  — the /v1/home entitlement union (uses the credits arm).
//   creditMeter  — the /v1/home credit_meter block (optional).
export function CreditMeter({ entitlement, creditMeter }) {
  const view = resolveCreditMeter(entitlement, creditMeter);
  if (!view) return null;

  const { granted, used, remaining, bank, tagVariant, tagLabel, poolBarVariant, bankBarVariant, alert } = view;
  const grantDaysLeft = view.grantExpiresAt ? daysUntil(view.grantExpiresAt) : null;

  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Flex direction="row" gap="small" align="center">
          <Text format={{ fontWeight: "bold" }}>Credits</Text>
          <StatusTag variant={tagVariant}>{tagLabel}</StatusTag>
        </Flex>

        {bank ? (
          <>
            {/* Pool — depletion meter over the period grant. */}
            <Flex direction="column" gap="extra-small">
              <Text>
                Monthly plan credits: {bank.poolRemaining} of {bank.poolGrant}{" "}
                left
              </Text>
              <ProgressBar
                title={`${bank.poolUsed} of ${bank.poolGrant} used`}
                value={bank.poolUsed}
                maxValue={bank.poolGrant > 0 ? bank.poolGrant : 1}
                showPercentage={true}
                variant={poolBarVariant}
              />
            </Flex>
            {bank.bankGranted > 0 ? (
              // Bank — level gauge over the granted total (refills on
              // purchase, drains on spend; never expires).
              <Flex direction="column" gap="extra-small">
                <Flex direction="row" gap="extra-small" align="center">
                  <Text>
                    Additional credits (never expire): {bank.bankRemaining} of{" "}
                    {bank.bankGranted} left
                  </Text>
                  {bank.bankLow && (
                    <StatusTag variant="warning">Running low</StatusTag>
                  )}
                </Flex>
                <ProgressBar
                  title={`${bank.bankRemaining} of ${bank.bankGranted} left`}
                  value={bank.bankRemaining}
                  maxValue={bank.bankGranted > 0 ? bank.bankGranted : 1}
                  showPercentage={true}
                  variant={bankBarVariant}
                />
              </Flex>
            ) : (
              // Graceful degradation: the host's backend predates
              // top_up_bank_granted, so the bank total is unknown — text
              // only, no bar (never divide by zero, never "of 0").
              <Flex direction="column" gap="extra-small">
                <Text>Additional credits: {bank.bankRemaining} left</Text>
                <Text format={{ fontStyle: "italic" }}>
                  Additional credits don't expire.
                </Text>
              </Flex>
            )}
          </>
        ) : (
          <>
            {/* PRIMARY signal — large and obvious. */}
            <Text format={{ fontWeight: "bold", fontSize: "lg" }}>
              {remaining} of {granted} credits left
            </Text>
            <ProgressBar
              title={`${used} used`}
              value={used}
              maxValue={granted > 0 ? granted : 1}
              showPercentage={true}
              variant={poolBarVariant}
            />
          </>
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
