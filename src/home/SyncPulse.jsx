import React from "react";
import { Flex, Tile, Text, StatusTag } from "@hubspot/ui-extensions";
import { fmtDate } from "../lib/format";

// Mode B health tile: the most recent sync at a glance. Driven by the
// /v1/home sync_pulse block (app-specific: sparkfly = contact-sync/member
// import counters; toast = order/menu sync). Renders nothing when the app
// has no sync pulse to report.
export function SyncPulse({ syncPulse }) {
  if (!syncPulse) return null;

  const { last_sync_at, records_synced, records_failed, label } = syncPulse;
  const failed = records_failed ?? 0;

  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Flex direction="row" gap="small" align="center">
          <Text format={{ fontWeight: "bold" }}>{label ?? "Sync activity"}</Text>
          {failed > 0 ? (
            <StatusTag variant="warning">{failed} failed</StatusTag>
          ) : (
            <StatusTag variant="success">Healthy</StatusTag>
          )}
        </Flex>
        <Flex direction="row" gap="large">
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: "demibold" }}>Records synced</Text>
            <Text>{records_synced ?? 0}</Text>
          </Flex>
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: "demibold" }}>Failed</Text>
            <Text>{failed}</Text>
          </Flex>
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: "demibold" }}>Last sync</Text>
            <Text>{last_sync_at ? fmtDate(last_sync_at) : "Never"}</Text>
          </Flex>
        </Flex>
      </Flex>
    </Tile>
  );
}

export default SyncPulse;
