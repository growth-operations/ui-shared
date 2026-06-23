// SandboxInstall — the shared "Install on a sandbox" action.
//
// The one sanctioned path to a sandbox install (a customer can't self-install on
// a sandbox from the marketplace — the backend rejects that). From a prod
// portal, this asks the app's mint endpoint for a signed sandbox install link
// (which carries sandbox=true + the prod customer to link), then surfaces it for
// the user to open on their sandbox account.
//
// Extensible per app: the caller passes the mint `path` on its OWN backend
// (base-hosted apps -> /v1/hubspot/app_pages/... no; the install mint lives at
// /v2/hubspot/install/{app}/sandbox-link on base; self-hosted apps serve their
// own), plus the portalId. callAppApi targets context.variables.BASE_URL, so
// each app's BASE_URL routes to the right service. Apps not allowlisted get a
// 403 from the endpoint, surfaced as a calm message.
import React, { useState } from "react";
import { Flex, Heading, Text, Button, Link, Alert } from "@hubspot/ui-extensions";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mint = async () => {
    setLoading(true);
    setError(null);
    try {
      const pid = portalId ?? context.portal.id;
      const sep = path.includes("?") ? "&" : "?";
      const res = await callAppApi(context, `${path}${sep}portalId=${pid}`, "POST");
      setInstallUrl(res?.install_url ?? null);
    } catch (err) {
      // The backend 403s apps that don't allow sandbox installs — show its
      // message rather than a generic failure.
      setError(err instanceof AppApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex direction="column" gap="small">
      <Heading>{heading}</Heading>
      <Text>
        {description ??
          `Spin up ${appName} on a HubSpot sandbox account, linked to your billing. ` +
            `Generate a link, then open it while signed in to your sandbox.`}
      </Text>

      {error && (
        <Alert title="Couldn't create a sandbox link" variant="warning">
          <Text>{error}</Text>
        </Alert>
      )}

      {installUrl ? (
        <Flex direction="column" gap="extra-small">
          <Link href={{ url: installUrl, external: true }}>
            Open the sandbox install →
          </Link>
          <Text variant="microcopy">
            Open this while signed in to the sandbox account you want to install on.
          </Text>
        </Flex>
      ) : (
        <Button
          variant="secondary"
          disabled={loading}
          onClick={mint}
        >
          {loading ? "Generating…" : "Generate sandbox install link"}
        </Button>
      )}
    </Flex>
  );
}

export default SandboxInstall;
