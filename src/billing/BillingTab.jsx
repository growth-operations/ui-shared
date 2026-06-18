import React, { useState } from "react";
import {
  hubspot,
  Flex,
  Heading,
  Text,
  Tile,
  LoadingButton,
  Alert,
} from "@hubspot/ui-extensions";
import { useStrictModeEffect } from "../lib/useStrictModeEffect";
import { fmtDate, daysUntil } from "../lib/format";
import { CreditMeter } from "../home/CreditMeter";

// The shared Billing tab for all Growth Operations apps. Branches on the
// entitlement union (CONTRACT.md):
//   trial_subscription -> the toast/sparkfly-proven Stripe Customer Portal
//                         pattern: pre-create a portal session on mount, a
//                         primary "Manage billing in Stripe →" link at the top,
//                         and a color-coded status panel (per Andrew's feedback;
//                         no invoice LineChart for flat-rate plans).
//   credits            -> the CreditMeter + a "Pick a plan" / "Buy credits" CTA.
//
// Props:
//   context — the UI-extension serverless context (context.portal.id).
//   state   — the /v1/home payload (entitlement union, billing_base_url, app_id).
//   appKey  — the Stripe/billing app_key for THIS app (e.g. "hubspot_toast").
//             Always a prop — never hardcoded in the shared package.

// Color-coded account-status panel (per Andrew's billing feedback): trial =>
// yellow + days left + end date; active => green + next renewal; past_due =>
// red + warning. Replaces the low-value flat-rate invoice chart.
function StatusPanel({ entitlement }) {
  if (!entitlement) return null;
  const {
    status,
    current_period_end,
    trial_ends_at,
    sandbox_trial_expires_at,
    cancel_at_period_end,
  } = entitlement;

  // HubSpot's Alert renders `title` beside the body in a narrow column, which
  // squeezes multi-line status detail into awkward wraps. Put the headline as a
  // bold first line INSIDE the body (full width) and leave the Alert title unset
  // so the detail flows across the panel.
  if (status === "trialing") {
    const trialEnd = trial_ends_at || current_period_end || sandbox_trial_expires_at;
    const left = daysUntil(trialEnd);
    const leftLabel =
      left == null
        ? "Free trial active"
        : left <= 0
        ? "Your free trial ends today"
        : `${left} day${left === 1 ? "" : "s"} left in your free trial`;
    return (
      <Alert variant="warning">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>{leftLabel}</Text>
          <Text>
            Trial ends {fmtDate(trialEnd)}. Add a plan in Stripe before then to
            keep syncing.
          </Text>
        </Flex>
      </Alert>
    );
  }

  if (status === "active") {
    return (
      <Alert variant="success">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>You're all set</Text>
          <Text>
            Your subscription is active. Next renewal:{" "}
            {fmtDate(current_period_end)}.
          </Text>
          {cancel_at_period_end && (
            <Text format={{ fontStyle: "italic" }}>
              Cancels at the end of the current period.
            </Text>
          )}
        </Flex>
      </Alert>
    );
  }

  if (status === "past_due") {
    return (
      <Alert variant="error">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>
            Your subscription is past due
          </Text>
          <Text>
            We couldn't process your latest payment. Update your payment method
            in Stripe to avoid losing access.
          </Text>
        </Flex>
      </Alert>
    );
  }

  if (status === "pending_purchase") {
    return (
      <Alert variant="warning">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>Your free trial has ended</Text>
          <Text>Choose a plan in Stripe to resume syncing your data.</Text>
        </Flex>
      </Alert>
    );
  }

  return (
    <Tile>
      <Text format={{ fontWeight: "bold" }}>Status: {status ?? "Unknown"}</Text>
    </Tile>
  );
}

// Pre-creates a Stripe billing/checkout portal session on mount and returns
// { portalUrl, loading, error }. Shared by both arms — the credits arm reuses
// the same portal endpoint for v1 (see note in CreditsBilling below).
function usePortalSession({ context, state, appKey }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [portalUrl, setPortalUrl] = useState(null);

  // Pre-create on mount so the link is one real click (Stripe can't be iframed;
  // UI Extensions have no open-URL action — only Link, whose href must exist
  // before render).
  useStrictModeEffect(
    async ({ mounted, resetOnUnmount }) => {
      // `state` is the /v1/home payload, fetched async by the host page — it's
      // null on the first render(s). Don't mistake "not loaded yet" for
      // "misconfigured": stay in loading until state arrives, then decide.
      // IMPORTANT: useStrictModeEffect latches an internal fetchedRef on any
      // normal completion, so a bare `return` here would block the re-run when
      // state later arrives (→ spinner forever). resetOnUnmount() clears that
      // ref so the deps-change re-run (state?.billing_base_url) actually fires.
      if (!state) {
        resetOnUnmount();
        return;
      }
      try {
        const base = state.billing_base_url;
        if (!base) throw new Error("Billing service not configured");
        if (!appKey) throw new Error("Missing appKey for billing portal");
        const portalId = context?.portal?.id;

        // Return to THIS app's Billing page after Stripe (named app-page deep
        // link /app/{portalId}/{appId}/{pagePath}); fall back to HubSpot home.
        const returnUrl = state?.app_id
          ? `https://app.hubspot.com/app/${portalId}/${state.app_id}/billing`
          : "https://app.hubspot.com/";

        // hubspot.fetch: body must be a plain OBJECT (HubSpot serializes it),
        // NOT a JSON string, and only Authorization survives as a header —
        // do not set Content-Type or any other header.
        const res = await hubspot.fetch(`${base}/v1/billing/portal`, {
          method: "POST",
          body: {
            app_key: appKey,
            portal_id: String(portalId),
            return_url: returnUrl,
          },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Billing portal request failed (${res.status}): ${text}`);
        }
        const { url } = await res.json();
        if (!url) throw new Error("No billing portal URL returned");
        if (mounted.current) setPortalUrl(url);
      } catch (perr) {
        if (mounted.current) setError(String(perr));
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [context, appKey, state?.billing_base_url, state?.app_id]
  );

  return { portalUrl, loading, error };
}

function TrialSubscriptionBilling({ context, state, appKey }) {
  const { portalUrl, loading, error } = usePortalSession({ context, state, appKey });

  return (
    <Flex direction="column" gap="medium">
      {/* PRIMARY CTA at the very top, large and obvious (per billing feedback).
          A Button with href navigates to the portal (Button supports href +
          external) so it reads as a real button, not a text link; LoadingButton
          shows the prepared/loading state inline. */}
      {error ? (
        <Alert title="Couldn't open billing" variant="danger">
          <Text>{error}</Text>
        </Alert>
      ) : (
        <LoadingButton
          href={portalUrl ? { url: portalUrl, external: true } : undefined}
          loading={loading}
          disabled={!portalUrl}
          variant="primary"
        >
          {portalUrl ? "Manage billing in Stripe" : "Preparing billing…"}
        </LoadingButton>
      )}

      <StatusPanel entitlement={state?.entitlement} />

      <Text format={{ fontStyle: "italic" }}>
        Billing is managed in Stripe across all Growth Operations apps. Use the
        link above to update your plan, payment method, or view invoices.
      </Text>
    </Flex>
  );
}

function CreditsBilling({ context, state, appKey }) {
  // NOTE: the credit-pack / paid-allowance checkout backend is net-new and
  // pending. For v1 the "Pick a plan" / "Buy credits" CTA reuses the same
  // Stripe portal session pattern (routes to the portal); swap the endpoint to
  // the credit checkout once that backend lands.
  const { portalUrl, loading, error } = usePortalSession({ context, state, appKey });

  return (
    <Flex direction="column" gap="medium">
      <CreditMeter
        entitlement={state?.entitlement}
        creditMeter={state?.credit_meter}
      />

      {/* PRIMARY CTA at top: pick a plan / buy credits. Button-with-href so it
          reads as a real button; LoadingButton shows the prepared/loading state. */}
      {error ? (
        <Alert title="Couldn't open checkout" variant="danger">
          <Text>{error}</Text>
        </Alert>
      ) : (
        <LoadingButton
          href={portalUrl ? { url: portalUrl, external: true } : undefined}
          loading={loading}
          disabled={!portalUrl}
          variant="primary"
        >
          {portalUrl ? "Pick a plan or buy credits" : "Preparing checkout…"}
        </LoadingButton>
      )}

      <Text format={{ fontStyle: "italic" }}>
        Top up or move to a paid monthly allowance to keep going. Billing is
        managed in Stripe across all Growth Operations apps.
      </Text>
    </Flex>
  );
}

export function BillingTab({ context, state, appKey }) {
  const mode = state?.entitlement?.mode;

  return (
    <Flex direction="column" gap="medium">
      <Heading>Billing</Heading>
      {mode === "credits" ? (
        <CreditsBilling context={context} state={state} appKey={appKey} />
      ) : (
        <TrialSubscriptionBilling context={context} state={state} appKey={appKey} />
      )}
    </Flex>
  );
}

export default BillingTab;
