import React from "react";
import { Flex, Tile, Text, ProgressBar, BarChart } from "@hubspot/ui-extensions";
import { periodComparisonOf } from "../lib/homeBlocks";

// The post-checklist Home usage block: credits per billing period. Two
// renderings, picked off the resolved view's `kind`:
//
//   "periods" — the backend shipped the additive `periods` payload (2–3
//     windows, oldest → newest, friendly slice names): ONE stacked BarChart,
//     one bar per billing period, stacks = features. The per-period totals
//     line underneath preserves what the progress bars showed.
//   "legacy"  — pre-periods backend: the last full period vs the current
//     period-to-date as two progress-bar columns with the raw per-action
//     breakdown beneath each.
//
// Both are fed by state.period_comparison, which the backend leaves null
// until the install has one full closed period; this renders nothing then.
// Normalization (labels, totals, chart rows/colors/caption) lives in
// ../lib/homeBlocks (unit-tested).

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

// key={fingerprint}: BarChart is a HubSpot "remote component" (rendered
// outside this iframe via HubSpot's bridge) — a prop/data change alone was
// confirmed NOT to update a rendered chart (see UsageTab), so a payload
// refresh must HARD-REMOUNT it via the React key, not re-render in place.
function PeriodsChart({ chart }) {
  const fingerprint = chart.rows
    .map((r) => `${r.period}|${r.feature}|${r.credits}`)
    .join(";");
  return (
    <Flex direction="column" gap="small">
      <BarChart
        key={fingerprint}
        data={chart.rows}
        axes={{
          x: { field: "period", fieldType: "category", label: "Billing period" },
          y: { field: "credits", fieldType: "linear", label: "Credits" },
          options: {
            groupFieldByColor: "feature",
            stacking: true,
            colors: chart.colors,
          },
        }}
        options={{ showLegend: true, showTooltips: true, showDataLabels: false }}
      />
      <Text variant="microcopy">{chart.caption}</Text>
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
        {view.kind === "periods" ? (
          <PeriodsChart chart={view.chart} />
        ) : (
          <Flex direction="row" gap="large">
            <PeriodColumn period={view.last} maxTotal={view.maxTotal} />
            <PeriodColumn period={view.current} maxTotal={view.maxTotal} />
          </Flex>
        )}
      </Flex>
    </Tile>
  );
}

export default PeriodComparison;
