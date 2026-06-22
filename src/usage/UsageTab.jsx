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

const DEFAULT_BASE_PATH = "/api/v1/usage";

const WINDOW_OPTIONS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
];

// context: extension context. basePath/portalId: target the right backend
// (base-hosted apps pass both). appName: chart copy.
export function UsageTab({
  context,
  basePath = DEFAULT_BASE_PATH,
  portalId,
  appName = "this app",
}) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState("30");
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
      <Flex direction="column" gap="medium">
        <Heading>Usage</Heading>
        <Alert title="Couldn't load usage" variant="warning">
          <Text>{error}</Text>
        </Alert>
      </Flex>
    );
  }

  const series = data?.series ?? [];
  const usedInWindow = data?.used_in_window ?? 0;
  const remaining = data?.remaining ?? 0;
  const granted = data?.granted ?? 0;
  const hasActivity = usedInWindow > 0;

  return (
    <Flex direction="column" gap="medium">
      <Flex direction="row" justify="between" align="end">
        <Heading>Usage</Heading>
        <Select
          label="Window"
          name="window"
          options={WINDOW_OPTIONS}
          value={days}
          onChange={setDays}
        />
      </Flex>

      <Tile>
        <Statistics>
          <StatisticsItem label="Credits used (window)" number={usedInWindow} />
          <StatisticsItem label="Remaining" number={remaining} />
          <StatisticsItem label="Granted" number={granted} />
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
