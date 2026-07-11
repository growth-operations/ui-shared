// SandboxInstall — the shared "Install on a sandbox" action.
//
// The one sanctioned path to a sandbox install (a customer can't self-install on
// a sandbox from the marketplace — the backend rejects that). From a prod
// portal, this first GETs the account's existing linked sandboxes + limit, then
// — only when still under the limit — mints a signed sandbox install link
// (carrying sandbox=true + the prod customer to link) THE MOMENT THE COMPONENT
// MOUNTS, so the link is a single, ordinary click — open it on the sandbox
// account you want to install on, no separate "generate" step first. HubSpot's
// Link/Button href must be a static value at render time (can't be set from an
// async result in the same click), so minting on mount rather than on click is
// what makes one-click possible at all.
//
// Always shows what's already linked (previously this rendered the mint action
// unconditionally with no signal a sandbox already existed, and a customer
// could keep minting more with zero visibility). At the limit, shows the
// linked list + a "X of Y used" indicator with no mint action underneath —
// not a disabled/dead button, just nothing to click. Each linked sandbox is a
// card showing who connected it and when, a link to its own app-pages console,
// and an uninstall action (armed/confirm — same two-step pattern as the
// migration console's rollback).
//
// Extensible per app: the caller passes the mint `path` on its OWN backend
// (base-hosted apps -> /v1/hubspot/app_pages/... no; the install mint lives at
// /v2/hubspot/install/{app}/sandbox-link on base; self-hosted apps serve their
// own), plus the portalId. The SAME path is used for both the GET (status) and
// POST (mint) — the backend distinguishes by HTTP method. The uninstall action
// posts to `${path}/{sandboxPortalId}/uninstall`. callAppApi targets
// context.variables.BASE_URL, so each app's BASE_URL routes to the right
// service. Apps not allowlisted get a 403 from the endpoint, surfaced as a
// calm message.
import React, { useEffect, useState } from "react";
import {
  Flex,
  Tile,
  Heading,
  Text,
  Link,
  Alert,
  Button,
  StatusTag,
} from "@hubspot/ui-extensions";

import { callAppApi, AppApiError } from "../sdk/app/base";
import { fmtDateTime } from "../lib/format";

// context: extension context. path: the status+mint endpoint on the app's
// backend (e.g. `/v2/hubspot/install/${appKey}/sandbox-link`). portalId: the
// prod portal minting the link. appName: copy. heading/description: optional
// overrides.
export function SandboxInstall({
  context,
  path,
  portalId,
  appName = "this app",
  heading = "Install on a sandbox",
  description,
}) {
  const [linkedSandboxes, setLinkedSandboxes] = useState([]);
  const [limit, setLimit] = useState(1);
  const [installUrl, setInstallUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [armedUninstall, setArmedUninstall] = useState(null); // portal_id or null
  const [uninstalling, setUninstalling] = useState(null); // portal_id or null
  const [uninstallError, setUninstallError] = useState(null);

  const pid = portalId ?? context.portal.id;
  const sep = path.includes("?") ? "&" : "?";
  const qs = `${path}${sep}portalId=${pid}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await callAppApi(context, qs, "GET");
        if (cancelled) return;
        const linked = status?.linked_sandboxes ?? [];
        const cap = status?.limit ?? 1;
        setLinkedSandboxes(linked);
        setLimit(cap);
        // Only mint (and offer) a NEW link while still under the limit — at
        // the limit, the linked list above is the whole story; there's
        // nothing else to click.
        if (linked.length < cap) {
          const res = await callAppApi(context, qs, "POST");
          if (!cancelled) setInstallUrl(res?.install_url ?? null);
        }
      } catch (err) {
        // The backend 403s apps that don't allow sandbox installs — show its
        // message rather than a generic failure.
        if (!cancelled) {
          setError(err instanceof AppApiError ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, portalId]);

  async function doUninstall(sandboxPortalId) {
    setUninstalling(sandboxPortalId);
    setUninstallError(null);
    try {
      await callAppApi(context, `${qs}/${sandboxPortalId}/uninstall`, "POST");
      setLinkedSandboxes((prev) =>
        prev.filter((s) => s.portal_id !== sandboxPortalId)
      );
      setArmedUninstall(null);
    } catch (err) {
      setUninstallError(err instanceof AppApiError ? err.message : String(err));
    } finally {
      setUninstalling(null);
    }
  }

  const atLimit = linkedSandboxes.length >= limit;

  return (
    <Flex direction="column" gap="small">
      <Flex direction="row" gap="small" align="center">
        <Heading>{heading}</Heading>
        {!loading && !error && (
          // At the limit is the NORMAL end state for the common case (limit
          // defaults to 1) — reaching it isn't a problem, so this reads
          // success/neutral either way, never a warning color.
          <StatusTag variant="success">
            {linkedSandboxes.length} of {limit} used
          </StatusTag>
        )}
      </Flex>
      <Text>
        {description ??
          `Spin up ${appName} on a HubSpot sandbox account, linked to your billing. ` +
            `Open the link below on the sandbox account you want to install on.`}
      </Text>

      {error && (
        <Alert title="Couldn't create a sandbox link" variant="warning">
          <Text>{error}</Text>
        </Alert>
      )}

      {uninstallError && (
        <Alert title="Couldn't uninstall that sandbox" variant="warning">
          <Text>{uninstallError}</Text>
        </Alert>
      )}

      {linkedSandboxes.length > 0 && (
        <Flex direction="column" gap="small">
          <Text format={{ fontWeight: "bold" }}>Already linked</Text>
          {linkedSandboxes.map((s) => (
            <Tile key={s.portal_id}>
              <Flex direction="column" gap="extra-small">
                <Flex direction="row" gap="small" align="center">
                  <Text format={{ fontWeight: "demibold" }}>
                    {s.name || s.portal_id}
                  </Text>
                  <StatusTag variant="default">{s.status}</StatusTag>
                </Flex>
                <Text variant="microcopy">
                  Connected {s.connected_at ? fmtDateTime(s.connected_at) : "—"}
                  {s.connected_by ? ` by ${s.connected_by}` : ""}
                </Text>
                <Flex direction="row" gap="small" align="center">
                  {s.console_url && (
                    <Link href={{ url: s.console_url, external: true }}>
                      Open in HubSpot →
                    </Link>
                  )}
                  {armedUninstall === s.portal_id ? (
                    <Flex direction="row" gap="small" align="center">
                      <Text variant="microcopy">Uninstall this sandbox?</Text>
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => doUninstall(s.portal_id)}
                        disabled={uninstalling === s.portal_id}
                      >
                        Confirm uninstall
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => setArmedUninstall(null)}
                        disabled={uninstalling === s.portal_id}
                      >
                        Cancel
                      </Button>
                    </Flex>
                  ) : (
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => setArmedUninstall(s.portal_id)}
                    >
                      Uninstall…
                    </Button>
                  )}
                </Flex>
              </Flex>
            </Tile>
          ))}
        </Flex>
      )}

      {installUrl && (
        <Flex direction="column" gap="extra-small">
          <Link href={{ url: installUrl, external: true }}>
            Install on a sandbox →
          </Link>
          <Text variant="microcopy">
            Opens HubSpot's install screen for the sandbox account you
            choose — you don't need to switch accounts first.
          </Text>
        </Flex>
      )}

      {!loading && !error && atLimit && linkedSandboxes.length > 0 && (
        <Text variant="microcopy">
          Need another sandbox linked? Contact us.
        </Text>
      )}

      {loading && !error && <Text variant="microcopy">Checking your sandbox installs…</Text>}
    </Flex>
  );
}

export default SandboxInstall;
