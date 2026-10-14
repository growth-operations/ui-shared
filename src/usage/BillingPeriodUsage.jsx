// BillingPeriodUsage — usage-over-time chart bucketed by BILLING PERIOD.
//
// The billing-period alternative to UsageTab's rolling-days LineChart
// (Jasper 2026-10-14: the internal Installation card went billing-period —
// "Current / Last 2 / Last 3 / Last 6 / Last 12" — and the customer Usage
// tab converts to the exact same style; one shared component serves both).
// One stacked BarChart, one bar per billing period (backend-supplied label,
// e.g. "Oct 12 – Nov 12"), stacks = features, with the lookback Select in
// the heading row.
//
// Backend contract: GET {base}{basePath}?portalId=<id>&periods=<N> →
//   { series: [{ period: "Oct 12 – Nov 12", feature: "Fit Scores", credits: 3 }],
//     used_in_window: <int>, granted: <int|null>, remaining: <int|null> }
// `series` is sparse (no zero-filled bars); window math lives in common's
// billing_period_windows + CreditService.usage_series_by_period.
//
// fetchUsage override: non-standard hosts (the GOAA internal card, whose
// endpoint is keyed by installation id, not portalId) pass their own
// (periods) => Promise<{series, ...}>; the default hits the standard
// basePath/portalId URL via hubspot.fetch.
import React, { useState } from "react";
import {
  hubspot,
  Alert,
  BarChart,
  Box,
  EmptyState,
  Flex,
  Heading,
  LoadingSpinner,
  Select,
  Statistics,
  StatisticsItem,
  Text,
  Tile,
} from "@hubspot/ui-extensions";

import { useStrictModeEffect } from "../lib/useStrictModeEffect";

const DEFAULT_BASE_PATH = "/api/v1/usage";

// The dropdown is billing-period scoped, not day scoped: "Current" = just
// the in-flight period; "Last N" = N periods ending with the current one.
export const BILLING_PERIOD_OPTIONS = [
  { label: "Current", value: "1" },
  { label: "Last 2", value: "2" },
  { label: "Last 3", value: "3" },
  { label: "Last 6", value: "6" },
  { label: "Last 12", value: "12" },
];

export function usedWindowLabel(periodsValue) {
  return periodsValue === "1"
    ? "Used (current billing period)"
    : `Used (last ${periodsValue} billing periods)`;
}

export function usageUrl({ baseUrl = "", basePath, portalId, periods }) {
  return `${baseUrl}${basePath}?portalId=${portalId}&periods=${periods}`;
}

// The standard fetcher: the app's own usage endpoint with a periods param.
// Exported so hosts with the standard URL shape but custom fetch needs (auth
// headers, etc.) can wrap it.
export function makeUsageFetcher({ context, basePath = DEFAULT_BASE_PATH, portalId }) {
  return async (periods) => {
    const base = context.variables?.BASE_URL ?? "";
    const pid = portalId ?? context.portal.id;
    const res = await hubspot.fetch(usageUrl({ baseUrl: base, basePath, portalId: pid, periods }), {
      method: "GET",
      timeout: 15000,
    });
    return res.json();
  };
}

// Hook-free presentational core (exported for tests): stats + stacked chart
// from an already-loaded payload.
export function BillingPeriodUsageView({
  data,
  periods,
  appName,
  showStats,
  emptyTitle = "No usage in this window",
  // Customer-facing default; internal hosts (the GOAA card) override — their
  // viewer isn't the user, so "you run a metered action" reads wrong there.
  emptyBody = null,
}) {
  const series = data?.series ?? [];
  const usedInWindow = data?.used_in_window ?? 0;
  const remaining = data?.remaining;
  const granted = data?.granted;
  const hasBalance = remaining != null && granted != null;

  return (
    <Flex direction="column" gap="medium">
      {showStats && (
        <Tile>
          <Statistics>
            <StatisticsItem label={usedWindowLabel(periods)} number={usedInWindow} />
            {hasBalance && <StatisticsItem label="Remaining" number={remaining} />}
            {hasBalance && <StatisticsItem label="Granted" number={granted} />}
          </Statistics>
        </Tile>
      )}

      {series.length === 0 ? (
        <EmptyState title={emptyTitle} layout="vertical">
          <Text>
            {emptyBody ??
              `Once you run a metered ${appName} action, your credit usage shows here by billing period. Try a longer lookback.`}
          </Text>
        </EmptyState>
      ) : (
        <Tile>
          <Flex direction="column" gap="small">
            <Text format={{ fontWeight: "bold" }}>Credits used per billing period</Text>
            <BarChart
              data={series}
              axes={{
                x: { field: "period", fieldType: "category", label: "Billing period" },
                y: { field: "credits", fieldType: "linear", label: "Credits" },
                // Category axes render in DATA order (ui-extensions docs), so
                // the backend's oldest-first series gives chronological bars.
                options: { groupFieldByColor: "feature", stacking: true },
              }}
              options={{ showLegend: true, showTooltips: true }}
            />
          </Flex>
        </Tile>
      )}
    </Flex>
  );
}

export function BillingPeriodUsage({
  context,
  basePath = DEFAULT_BASE_PATH,
  portalId,
  fetchUsage,
  appName = "this app",
  title = "Usage",
  titleAs = "heading", // "text" for CRM-card contexts (bold Text, not Heading)
  showStats = true,
  emptyTitle,
  emptyBody,
}) {
  const [periods, setPeriods] = useState("1");
  const fetcher = fetchUsage ?? makeUsageFetcher({ context, basePath, portalId });

  return (
    <Flex direction="column" gap="medium">
      <Flex direction="row" justify="between" align="end">
        {titleAs === "heading" ? (
          <Heading>{title}</Heading>
        ) : (
          <Text format={{ fontWeight: "bold" }}>{title}</Text>
        )}
        <Select
          label="Billing period"
          name="billing-period"
          options={BILLING_PERIOD_OPTIONS}
          value={periods}
          onChange={setPeriods}
        />
      </Flex>

      {/* key={periods}: a lookback change must hard-remount everything below
          the Select, not just re-render with new props. BarChart is a HubSpot
          "remote component" (rendered outside this iframe via HubSpot's own
          bridge) — a prop/data change alone was confirmed NOT to update the
          rendered chart (the UsageTab LineChart lesson). The Select stays
          OUTSIDE this key boundary so the control triggering the change is
          never torn down mid-interaction. */}
      <BillingPeriodContent
        key={periods}
        periods={periods}
        fetchUsage={fetcher}
        appName={appName}
        showStats={showStats}
        emptyTitle={emptyTitle}
        emptyBody={emptyBody}
      />
    </Flex>
  );
}

function BillingPeriodContent({ periods, fetchUsage, appName, showStats, emptyTitle, emptyBody }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useStrictModeEffect(
    async ({ mounted }) => {
      setLoading(true);
      try {
        const res = await fetchUsage(periods);
        if (mounted.current) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (mounted.current) setError(String(err));
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [periods, fetchUsage]
  );

  if (loading) return <LoadingSpinner showLabel label="Loading usage…" />;

  if (error) {
    return (
      <Alert title="Couldn't load usage" variant="warning">
        <Box flex="auto">
          <Text>{error}</Text>
        </Box>
      </Alert>
    );
  }

  return (
    <BillingPeriodUsageView
      data={data}
      periods={periods}
      appName={appName}
      showStats={showStats}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
    />
  );
}

export default BillingPeriodUsage;
