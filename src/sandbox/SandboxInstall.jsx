// SandboxInstall — the shared "Install on a sandbox" action.
//
// The one sanctioned path to a sandbox install (a customer can't self-install on
// a sandbox from the marketplace — the backend rejects that). From a prod
// portal, this mints a signed sandbox install link (carrying sandbox=true + the
// prod customer to link) THE MOMENT THE COMPONENT MOUNTS, so the link is a
// single, ordinary click — open it on the sandbox account you want to install
// on, no separate "generate" step first. HubSpot's Link/Button href must be a
// static value at render time (can't be set from an async result in the same
// click), so minting on mount rather than on click is what makes one-click
// possible at all.
//
// Extensible per app: the caller passes the mint `path` on its OWN backend
// (base-hosted apps -> /v1/hubspot/app_pages/... no; the install mint lives at
// /v2/hubspot/install/{app}/sandbox-link on base; self-hosted apps serve their
// own), plus the portalId. callAppApi targets context.variables.BASE_URL, so
// each app's BASE_URL routes to the right service. Apps not allowlisted get a
// 403 from the endpoint, surfaced as a calm message.
import React, { useEffect, useState } from "react";
import { Flex, Heading, Text, Link, Alert } from "@hubspot/ui-extensions";

import { callAppApi, AppApiError } from "../sdk/app/base";

// context: extension context. path: the mint endpoint on the app's backend
// (e.g. `/v2/hubspot/install/${appKey}/sandbox-link`). portalId: the prod portal
// minting the link. appName: copy. heading/description: optional overrides.
export function SandboxInstall({
  context,
  path,
  portalId,
  appName = "this app",
  heading = "Install on a sandbox",
  description,
}) {
  const [installUrl, setInstallUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pid = portalId ?? context.portal.id;
        const sep = path.includes("?") ? "&" : "?";
        const res = await callAppApi(context, `${path}${sep}portalId=${pid}`, "POST");
        if (!cancelled) setInstallUrl(res?.install_url ?? null);
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

  return (
    <Flex direction="column" gap="small">
      <Heading>{heading}</Heading>
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

      {loading && !error && <Text variant="microcopy">Preparing your sandbox install link…</Text>}
    </Flex>
  );
}

export default SandboxInstall;
