// UsageTab — the shared in-app credit usage view for credit apps.
//
// The off-Anvil answer to "show usage directly in-app", chart-first (matches
// the sparkfly/toast usage tabs): a LineChart of credits used per day over a
// window + headline Statistics (used in window / remaining / granted). Fed by
// the backend usage series at {basePath}/usage?portalId=&days= — credit_meter
// .recent on the home payload is only the last ~20 events, so the chart reads
// the dedicated, zero-filled, server-bucketed series instead.
//
// Self-hosted apps (sparkfly/toast) serve /api/v1/usage from their own service;
// base-hosted credit apps (line-item) pass `basePath` + `portalId` to hit base's
// /v1/hubspot/app_pages/{app}/usage. Trial/non-credit apps don't render this.
import React, { useState } from "react";
import {
  hubspot,
  Box,
  Flex,
  Heading,
  Text,
  Tile,
  Statistics,
  StatisticsItem,
  LineChart,
  Select,
  LoadingSpinner,
  Alert,
  EmptyState,
} from "@hubspot/ui-extensions";

import { useStrictModeEffect } from "../lib/useStrictModeEffect";
import { creditsBlockOf } from "../lib/creditDisplay";
import { CreditMeter } from "../home/CreditMeter";
import { BillingPeriodUsage } from "./BillingPeriodUsage";

const DEFAULT_BASE_PATH = "/api/v1/usage";

const WINDOW_OPTIONS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "Last 180 days", value: "180" },
  { label: "Last 365 days", value: "365" },
];

// context: extension context. basePath/portalId: target the right backend
// (base-hosted apps pass both). appName: chart copy. state: the /v1/home
// payload (optional) — when present, the credit meter renders at the TOP of
// the tab (Andrew's 2026-10 feedback: the meter moved off Home); without it
// the tab is chart-only, same as before. chart: "days" (default, rolling-day
// LineChart) or "billingPeriods" (stacked BarChart bucketed by billing period
// — requires the backend's ?periods= mode, shipped in common v1.35.0).
export function UsageTab({
  context,
  basePath = DEFAULT_BASE_PATH,
  portalId,
  appName = "this app",
  state = null,
  chart = "days",
}) {
  const [days, setDays] = useState("30");

  return (
    <Flex direction="column" gap="medium">
      {state && (
        // creditsBlockOf dual-reads payload.state.credits (base) ??
        // payload.credits (self-hosted) — a top-level-only read silently
        // dropped the two-pool split + "renews on" line on base-hosted apps.
        <CreditMeter
          entitlement={state.entitlement}
          creditMeter={state.credit_meter}
          credits={creditsBlockOf(state)}
        />
      )}

      {chart === "billingPeriods" ? (
        <BillingPeriodUsage
          context={context}
          basePath={basePath}
          portalId={portalId}
          appName={appName}
          title="Usage"
        />
      ) : (
        <DaysUsage
          days={days}
          onDaysChange={setDays}
          context={context}
          basePath={basePath}
          portalId={portalId}
          appName={appName}
        />
      )}
    </Flex>
  );
}

function DaysUsage({ days, onDaysChange, context, basePath, portalId, appName }) {
  return (
    <>
      <Flex direction="row" justify="between" align="end">
        <Heading>Usage</Heading>
        <Select
          label="Time period"
          name="time-period"
          options={WINDOW_OPTIONS}
          value={days}
          onChange={onDaysChange}
        />
      </Flex>

      {/* key={days}: a window change must hard-remount everything below the
          Select (Statistics + LineChart), not just re-render with new props.
          LineChart is a HubSpot "remote component" (rendered outside this
          iframe via HubSpot's own bridge) — a prop/data change alone was
          confirmed NOT to update the rendered chart, even though the
          backend series genuinely differs per window. The Select itself
          stays OUTSIDE this key boundary so the control that triggers the
          change is never torn down mid-interaction. */}
      <UsageContent
        key={days}
        context={context}
        basePath={basePath}
        portalId={portalId}
        appName={appName}
        days={days}
      />
    </>
  );
}

function UsageContent({ context, basePath, portalId, appName, days }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useStrictModeEffect(
    async ({ mounted }) => {
      setLoading(true);
      try {
        const base = context.variables?.BASE_URL ?? "";
        const pid = portalId ?? context.portal.id;
        const url = `${base}${basePath}?portalId=${pid}&days=${days}`;
        const res = await hubspot
          .fetch(url, { method: "GET", timeout: 15000 })
          .then((r) => r.json());
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
    [context, days]
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

  const series = data?.series ?? [];
  const usedInWindow = data?.used_in_window ?? 0;
  // Legacy (Anvil) installs have no credit balance — the backend returns null
  // granted/remaining. Show only the window usage stat for them; credit installs
  // get the full granted/remaining breakdown.
  const remaining = data?.remaining;
  const granted = data?.granted;
  const hasBalance = remaining != null && granted != null;
  const hasActivity = usedInWindow > 0;

  return (
    <Flex direction="column" gap="medium">
      <Tile>
        <Statistics>
          <StatisticsItem label={`Used (last ${days} days)`} number={usedInWindow} />
          {hasBalance && <StatisticsItem label="Remaining" number={remaining} />}
          {hasBalance && <StatisticsItem label="Granted" number={granted} />}
        </Statistics>
      </Tile>

      {!hasActivity ? (
        <EmptyState title="No usage yet" layout="vertical">
          <Text>
            Once you run a metered {appName} action, your credit usage shows here
            over time.
          </Text>
        </EmptyState>
      ) : (
        <Tile>
          <Flex direction="column" gap="small">
            <Text format={{ fontWeight: "bold" }}>Credits used per day</Text>
            <LineChart
              data={series}
              axes={{
                x: { field: "date", fieldType: "datetime", label: "Day" },
                y: { field: "credits", fieldType: "linear", label: "Credits" },
              }}
              options={{ showTooltips: true }}
            />
          </Flex>
        </Tile>
      )}
    </Flex>
  );
}

export default UsageTab;
