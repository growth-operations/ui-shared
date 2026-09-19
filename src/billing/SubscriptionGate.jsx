import React, { useState } from "react";
import {
  Alert,
  Flex,
  Link,
  LoadingSpinner,
  Text,
} from "@hubspot/ui-extensions";

import { useStrictModeEffect } from "../lib/useStrictModeEffect";
import { callAppApi } from "../sdk/app/base";

// Full-surface "no active subscription" gate for CRM cards (and any other
// extension surface that should hard-block a canceled install).
//
// Wrap a card's whole tree at the hubspot.extend level:
//
//   hubspot.extend(({ context, actions }) => (
//     <SubscriptionGate context={context} appName="Applicant Tracking System">
//       <MyCard ... />
//     </SubscriptionGate>
//   ));
//
// On mount it calls the app's `GET {checkPath}?portalId=…` (default
// /v1/entitlement — see CONTRACT.md "Subscription-canceled gate"), which
// returns { entitled, status, billing_url }. Canceled/uninstalled installs get
// a blocking Alert with a Go-to-Billing link; everyone else renders children.
//
// Deliberate behaviors (match the backend gate in common.entitlements.fastapi):
// - FAILS OPEN on fetch error: a transient backend/network failure must not
//   blank the card for paying customers. Enforcement still happens per-request
//   — the backend returns the same 402 contract from every gated endpoint.
// - Only canceled/uninstalled is blocked. past_due / pending_purchase / paused
//   keep their softer banner UX (billingBannerFor / BillingBanner) — dunning
//   and trial expiry must not hard-disable the product.
// - Mid-session cancellation (after a passing mount check) surfaces through
//   the card's existing error handling, since the gated endpoints 402 with the
//   same { detail, code: "subscription_canceled", billing_url } body.
//
// Props:
//   context   — the hubspot.extend context (portal.id, app.id, variables).
//   checkPath — backend entitlement-check path; default "/v1/entitlement".
//   appName   — display name for the copy, e.g. "Applicant Tracking System".
export function SubscriptionGate({
  context,
  children,
  checkPath = "/v1/entitlement",
  appName = "this app",
}) {
  // null = still loading; { entitled, status, billing_url } once resolved.
  const [check, setCheck] = useState(null);
  const [failedOpen, setFailedOpen] = useState(false);

  useStrictModeEffect(
    async ({ mounted }) => {
      try {
        const result = await callAppApi(
          context,
          `${checkPath}?portalId=${context.portal.id}`
        );
        if (mounted.current) setCheck(result);
      } catch (_e) {
        if (mounted.current) setFailedOpen(true);
      }
    },
    [context, checkPath]
  );

  if (failedOpen) return children;
  if (!check) {
    return <LoadingSpinner label="Checking subscription…" showLabel />;
  }
  if (check.entitled) return children;

  const billingUrl =
    check.billing_url ||
    (context?.portal?.id && context?.app?.id
      ? `https://app.hubspot.com/app/${context.portal.id}/${context.app.id}/billing`
      : null);

  return (
    <Alert title="No active subscription" variant="error">
      <Flex direction="column" gap="extra-small">
        <Text>
          Your {appName} subscription was canceled. Your data is still here —
          manage billing to pick up where you left off.
        </Text>
        {billingUrl && (
          <Link href={{ url: billingUrl, external: true }}>Go to Billing</Link>
        )}
      </Flex>
    </Alert>
  );
}

export default SubscriptionGate;
