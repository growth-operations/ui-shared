// AlertsTab — the shared customer alerts table, extensible per app.
//
// Every Growth Ops app surfaces the same base Alert shape ({ id, level, title,
// message, created_at, dismissable, action_name, action_url }) from the same
// serve/dismiss contract (common.alerts + the app's alerts router). This owns
// the shared chrome — level filter, pagination, fetch, and per-row dismiss —
// and exposes two extension points so apps with richer alert shapes (sparkfly's
// merge / replace-email / skip; toast's connection-lost retry) keep one table
// instead of forking it:
//
//   - renderRowActions(alert, { context, refresh }) -> node
//       Extra action UI rendered in the actions cell ALONGSIDE Dismiss. Use for
//       app-specific buttons that act on the alert then refresh the table.
//   - renderRow(alert, { context, refresh, dismiss, fetchOptions }) -> <TableRow>
//       Full per-row override (escape hatch) for apps whose row needs custom
//       layout — expandable merge panels, inline inputs, extra columns. When
//       provided it replaces the default row entirely; the app owns the cells.
//
// Omit both -> default rows (level tag, title/message + action link, time,
// Dismiss). Self-hosted apps (sparkfly, toast) call with default getAlerts/
// dismissAlert paths; base-hosted apps pass `basePath` + `portalId` so the SDK
// targets the base alerts route.
import React, { useState, useEffect } from "react";
import {
  Alert,
  EmptyState,
  Text,
  Link,
  Button,
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Select,
  Tag,
  Flex,
  LoadingSpinner,
} from "@hubspot/ui-extensions";

import { getAlerts, dismissAlert } from "../sdk/app/alerts";
import { fmtDate } from "../lib/format";

const PAGE_SIZE = 10;

const LEVEL_OPTIONS = [
  { label: "All Levels", value: "all" },
  { label: "Info", value: "info" },
  { label: "Warning", value: "warning" },
  { label: "Error", value: "error" },
  { label: "Critical", value: "critical" },
];

// Alert level -> HubSpot Tag variant.
const LEVEL_VARIANT = {
  info: "default",
  warning: "warning",
  error: "error",
  critical: "error",
};

function DefaultAlertRow({
  context,
  alert,
  refresh,
  onDismissed,
  fetchOptions,
  renderRowActions,
}) {
  const [dismissing, setDismissing] = useState(false);

  const dismiss = async () => {
    setDismissing(true);
    try {
      await dismissAlert(context, alert.id, fetchOptions);
      // Optimistically drop just this row from local state — no full re-fetch
      // of the whole alert list on every dismiss.
      onDismissed(alert.id);
    } finally {
      setDismissing(false);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <Tag variant={LEVEL_VARIANT[alert.level] || "default"}>
          {alert.level}
        </Tag>
      </TableCell>
      <TableCell>
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>{alert.title}</Text>
          <Text>{alert.message}</Text>
          {alert.action_url && alert.action_name && (
            <Link href={alert.action_url}>{alert.action_name}</Link>
          )}
        </Flex>
      </TableCell>
      <TableCell>{fmtDate(alert.created_at)}</TableCell>
      <TableCell>
        <Flex direction="row" gap="small" align="center">
          {/* App-specific actions render before Dismiss. */}
          {renderRowActions && renderRowActions(alert, { context, refresh })}
          {alert.dismissable && (
            <Button
              variant="secondary"
              size="xs"
              disabled={dismissing}
              onClick={dismiss}
            >
              {dismissing ? "Dismissing…" : "Dismiss"}
            </Button>
          )}
        </Flex>
      </TableCell>
    </TableRow>
  );
}

// context: extension context. basePath/portalId: forwarded to getAlerts/
// dismissAlert (base-hosted apps pass both; self-hosted apps omit them).
// renderRowActions / renderRow: per-app extension points (see file header).
export function AlertsTab({
  context,
  basePath,
  portalId,
  renderRowActions,
  renderRow,
}) {
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The options the SDK needs to target the right backend (base vs self-hosted).
  const fetchOptions = { basePath, portalId };

  const load = async (pageNumber, levelValue) => {
    setLoading(true);
    try {
      const response = await getAlerts(context, {
        offset: (pageNumber - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        orderBy: "created_at",
        orderDirection: "DESCENDING",
        filterField: levelValue !== "all" ? "level" : undefined,
        filterValue: levelValue !== "all" ? levelValue : undefined,
        ...fetchOptions,
      });
      setAlerts(response.alerts || []);
      setTotal(response.total || 0);
      setPage(pageNumber);
      setError(null);
    } catch (err) {
      setError(err.message);
      setAlerts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // Optimistically remove a dismissed alert from local state instead of
  // re-fetching the whole list. Keeps the dismiss interaction to a single API
  // call (the dismiss itself).
  const removeAlertLocally = (id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  };

  useEffect(() => {
    load(1, level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  const onLevelChange = (value) => {
    setLevel(value);
    load(1, value);
  };

  if (error) {
    return (
      <Alert title="Couldn't load alerts" variant="error">
        {error}
      </Alert>
    );
  }

  return (
    <Flex direction="column" gap="medium">
      <Select
        label="Filter by level"
        name="levelFilter"
        options={LEVEL_OPTIONS}
        value={level}
        onChange={onLevelChange}
      />
      {loading ? (
        <LoadingSpinner showLabel label="Loading alerts…" />
      ) : !alerts.length ? (
        <EmptyState title="No alerts" layout="vertical">
          <Text>There are currently no alerts that need your attention.</Text>
        </EmptyState>
      ) : (
        <Table
          paginated={total > PAGE_SIZE}
          page={page}
          pageCount={Math.ceil(total / PAGE_SIZE)}
          onPageChange={(p) => load(p, level)}
        >
          <TableHead>
            <TableHeader width="min">Level</TableHeader>
            <TableHeader width="max">Alert</TableHeader>
            <TableHeader width="min">Time</TableHeader>
            <TableHeader width="min"></TableHeader>
          </TableHead>
          <TableBody>
            {alerts.map((alert) => {
              const refresh = () => load(page, level);
              // Full-row override escape hatch: the app owns the cells.
              if (renderRow) {
                // Optimistic dismiss (drop the row locally); refresh stays
                // available for apps that want a full reload.
                const dismiss = () =>
                  dismissAlert(context, alert.id, fetchOptions).then(() =>
                    removeAlertLocally(alert.id)
                  );
                return (
                  <React.Fragment key={alert.id}>
                    {renderRow(alert, {
                      context,
                      refresh,
                      dismiss,
                      fetchOptions,
                    })}
                  </React.Fragment>
                );
              }
              return (
                <DefaultAlertRow
                  key={alert.id}
                  context={context}
                  alert={alert}
                  fetchOptions={fetchOptions}
                  refresh={refresh}
                  onDismissed={removeAlertLocally}
                  renderRowActions={renderRowActions}
                />
              );
            })}
          </TableBody>
        </Table>
      )}
    </Flex>
  );
}

export default AlertsTab;
