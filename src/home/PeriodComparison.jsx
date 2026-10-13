import React from "react";
import { Flex, Tile, Text, ProgressBar } from "@hubspot/ui-extensions";
import { periodComparisonOf } from "../lib/homeBlocks";

// The post-checklist Home usage block: the last full billing period vs the
// current period-to-date, side by side — one bar per period (shared
// denominator, so the bars are visually comparable) with the per-action
// credit breakdown beneath each. Fed by state.period_comparison, which the
// backend leaves null until the install has one full closed period; this
// renders nothing then.
//
// Bars are sentiment-free (always "success") — this is a comparison, not a
// health signal. Normalization (labels, totals, by-action lists, the shared
// maxTotal) lives in ../lib/homeBlocks (unit-tested).
function PeriodColumn({ period, maxTotal }) {
  return (
    <Flex direction="column" gap="extra-small">
      <Text format={{ fontWeight: "demibold" }}>{period.label}</Text>
      <Text>
        {period.total} {period.total === 1 ? "credit" : "credits"}
      </Text>
      <ProgressBar
        title={`${period.label}: ${period.total} credits`}
        value={period.total}
        maxValue={maxTotal}
        showPercentage={false}
        valueDescription={`${period.total} credits`}
        variant="success"
      />
      {period.byAction.length > 0 && (
        <Flex direction="column" gap="extra-small">
          {period.byAction.map((a) => (
            <Text key={a.action} variant="microcopy">
              {a.action}: {a.credits} {a.credits === 1 ? "credit" : "credits"}
            </Text>
          ))}
        </Flex>
      )}
    </Flex>
  );
}

export function PeriodComparison({ state }) {
  // periodComparisonOf dual-reads payload.state.period_comparison (base) ??
  // payload.period_comparison (self-hosted).
  const view = periodComparisonOf(state);
  if (!view) return null;

  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: "bold" }}>Credits by period</Text>
        <Flex direction="row" gap="large">
          <PeriodColumn period={view.last} maxTotal={view.maxTotal} />
          <PeriodColumn period={view.current} maxTotal={view.maxTotal} />
        </Flex>
      </Flex>
    </Tile>
  );
}

export default PeriodComparison;
