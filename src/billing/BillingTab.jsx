import React, { useState } from "react";
import {
  hubspot,
  Flex,
  Heading,
  Text,
  Tile,
  LoadingButton,
  Button,
  Alert,
} from "@hubspot/ui-extensions";
import { useStrictModeEffect } from "../lib/useStrictModeEffect";
import { fmtDate, daysUntil } from "../lib/format";
import { CreditMeter } from "../home/CreditMeter";
import { PlanGrid } from "./PlanGrid";

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
    mode,
    current_period_end,
    trial_ends_at,
    sandbox_trial_expires_at,
    cancel_at_period_end,
    has_payment_method,
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
    // What (if anything) the customer must do before the trial ends, by mode:
    //  - credits: pick/buy a credit plan to continue.
    //  - trial_subscription (plan already chosen — toast): the trial just needs
    //    a payment method. If one's already on file it auto-converts (nothing to
    //    do); if not, they must add one or Stripe cancels at trial end.
    //    has_payment_method may be null (unknown) — then give the safe ask.
    const trialCta =
      mode === "credits"
        ? "Choose a plan in Stripe before then to keep going."
        : has_payment_method === true
          ? "Your payment method is on file, so it converts automatically — nothing to do."
          : has_payment_method === false
            ? "Add a payment method in Stripe before then, or your subscription will be canceled."
            : "Add a payment method in Stripe before then so your subscription continues.";
    return (
      <Alert variant="warning">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>{leftLabel}</Text>
          <Text>
            Trial ends {fmtDate(trialEnd)}. {trialCta}
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
    const resumeCta =
      mode === "credits"
        ? "Choose a plan in Stripe to resume."
        : "Add a payment method in Stripe to resume syncing your data.";
    return (
      <Alert variant="warning">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>Your free trial has ended</Text>
          <Text>{resumeCta}</Text>
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
  // "Not ready" = the install hasn't been provisioned with a Stripe customer
  // yet (fresh/old account: no entitlement.status, or the portal endpoint 409s
  // with "no Stripe customer"). That's an expected pre-purchase state, not an
  // error — the UI shows a calm "finish setup" message instead of a red alert.
  const [notReady, setNotReady] = useState(false);

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
      // No Stripe customer yet → don't even try to open a portal. An install
      // that hasn't been provisioned has nothing to manage; show the calm "not
      // ready" state. The credits arm has NO `status` field (only the
      // not_installed shell does) but DOES carry `plan` once paid — treat a set
      // `plan` as ready so a paid credit customer gets the Manage button. Only
      // the trial arm relies on `status`.
      const ent = state?.entitlement;
      const status = ent?.status;
      const onPaidPlan = !!ent?.plan;
      const notProvisioned =
        !ent || status === "not_installed" || (status == null && !onPaidPlan);
      if (notProvisioned) {
        if (mounted.current) {
          setNotReady(true);
          setLoading(false);
        }
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
          // 409 "no Stripe customer yet" is the not-provisioned case, not a
          // failure — surface it as the calm not-ready state.
          if (res.status === 409 && /no stripe customer/i.test(text)) {
            if (mounted.current) setNotReady(true);
          } else {
            throw new Error(`Billing portal request failed (${res.status}): ${text}`);
          }
        } else {
          const { url } = await res.json();
          if (!url) throw new Error("No billing portal URL returned");
          if (mounted.current) setPortalUrl(url);
        }
      } catch (perr) {
        if (mounted.current) setError(String(perr));
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [context, appKey, state?.billing_base_url, state?.app_id, state?.entitlement?.status]
  );

  return { portalUrl, loading, error, notReady };
}

function TrialSubscriptionBilling({ context, state, appKey }) {
  const { portalUrl, loading, error, notReady } = usePortalSession({
    context,
    state,
    appKey,
  });

  // Install not provisioned with a Stripe customer yet — calm "finish setup"
  // state, not a red error. (Old/stale installs, or before the install flow's
  // provision_trial_install has run.)
  if (notReady) {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="Billing isn't set up yet" variant="info">
          <Text>
            Your trial and billing are still being set up for this install. Once
            setup completes, manage your plan and payment method here. If this
            persists, reinstall the app from the HubSpot marketplace to complete
            sign-in.
          </Text>
        </Alert>
      </Flex>
    );
  }

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
  // The Stripe portal session lets an EXISTING paid customer manage/switch/cancel
  // their plan, with proration handled by Stripe.
  const { portalUrl, loading, error, notReady } = usePortalSession({
    context,
    state,
    appKey,
  });

  const onPaidPlan = !!state?.entitlement?.plan;

  // PAID: do NOT show the plan picker. The picker's "Choose" starts a NEW Stripe
  // Checkout subscription — clicking another tier would create a SECOND
  // subscription (double-bill), not switch in place. Plan changes (upgrade/
  // downgrade/cancel) go through the Stripe Customer Portal, which swaps the
  // subscription item with proration. So on a paid plan we show the meter + a
  // "Manage subscription" portal link only. (Matches toast/sparkfly.)
  if (onPaidPlan) {
    return (
      <Flex direction="column" gap="medium">
        <CreditMeter
          entitlement={state?.entitlement}
          creditMeter={state?.credit_meter}
        />
        {!notReady &&
          (error ? (
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
              {portalUrl ? "Manage subscription" : "Preparing billing…"}
            </LoadingButton>
          ))}
        <Text format={{ fontStyle: "italic" }}>
          Change or cancel your plan in Stripe — billing is managed across all
          Growth Operations apps.
        </Text>
      </Flex>
    );
  }

  // FREE tier: show the upgrade path (PlanGrid → first-paid Checkout). PlanGrid
  // renders nothing if no plans are mirrored yet, so fall back to a portal CTA
  // then so the tab isn't empty.
  const hasPlans = (state?.plans?.length ?? 0) > 0;
  return (
    <Flex direction="column" gap="medium">
      <CreditMeter
        entitlement={state?.entitlement}
        creditMeter={state?.credit_meter}
      />
      <PlanGrid context={context} state={state} appKey={appKey} />
      {!notReady && !hasPlans &&
        (error ? (
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
            {portalUrl ? "Buy credits in Stripe" : "Preparing billing…"}
          </LoadingButton>
        ))}
      {!hasPlans && (
        <Text format={{ fontStyle: "italic" }}>
          Billing is managed in Stripe across all Growth Operations apps.
        </Text>
      )}
    </Flex>
  );
}

// Legacy (Anvil) installs are billed through their existing subscription, NOT
// the credit model. Render a calm informational panel — never the credit meter
// or plan picker, which would falsely tell a paying Anvil customer they're out
// of credits and push them to buy a credit plan.
function LegacyBilling({ state }) {
  const manageUrl = state?.legacy_billing_url;
  return (
    <Flex direction="column" gap="medium">
      <Alert title="Managed through your existing subscription" variant="info">
        <Text>
          Your plan and payment method are billed through your existing
          subscription. There's nothing to set up here.
        </Text>
      </Alert>
      {manageUrl && (
        <Button href={{ url: manageUrl, external: true }} variant="secondary">
          Manage subscription
        </Button>
      )}
    </Flex>
  );
}

export function BillingTab({ context, state, appKey }) {
  const mode = state?.entitlement?.mode;

  return (
    <Flex direction="column" gap="medium">
      <Heading>Billing</Heading>
      {mode === "legacy" ? (
        <LegacyBilling state={state} />
      ) : mode === "credits" ? (
        <CreditsBilling context={context} state={state} appKey={appKey} />
      ) : (
        <TrialSubscriptionBilling context={context} state={state} appKey={appKey} />
      )}
    </Flex>
  );
}

export default BillingTab;
