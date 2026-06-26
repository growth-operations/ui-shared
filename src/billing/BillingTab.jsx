import React from "react";
import {
  Flex,
  Heading,
  Text,
  Tile,
  LoadingButton,
  Button,
  Alert,
} from "@hubspot/ui-extensions";
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

function TrialSubscriptionBilling({ context, state, appKey, openIframe = null }) {
  const ent = state?.entitlement;

  // Install not provisioned with a Stripe customer yet — calm "finish setup"
  // state, not a red error. (Old/stale installs, or before provision_trial_install
  // has run.) The trial arm has a `status`; not_installed / missing means
  // un-provisioned.
  const notReady = !ent || ent.status == null || ent.status === "not_installed";
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

  // Direct external link to GET /v1/billing/portal/start — resolves the customer
  // + creates the Customer Portal session server-side and 303s to Stripe IN THE
  // OPENED TAB. No in-iframe portal-session fetch (that round trip hit the billing
  // service's cold-start/CPU stall → the iframe's 15s "Gateway took too long").
  // Same pattern as the credits arm + PlanGrid's /checkout/start. null (button
  // disabled) until billing_base_url is known.
  const base = state?.billing_base_url ?? null;
  const portalId = context?.portal?.id;
  const returnUrl = state?.app_id
    ? `https://app.hubspot.com/app/${portalId}/${state.app_id}/billing`
    : "https://app.hubspot.com/";
  const portalStartUrl =
    base && appKey && portalId
      ? `${base}/v1/billing/portal/start` +
        `?app_key=${encodeURIComponent(appKey)}` +
        `&portal_id=${encodeURIComponent(String(portalId))}` +
        `&return_url=${encodeURIComponent(returnUrl)}`
      : null;

  // Tier picker — shown ONLY while trialing (the lifecycle: trial starts on the
  // entry tier at install; while trialing the customer may upgrade to a higher
  // tier in-app; once active, plan changes go through support). We show the FULL
  // ladder for context so the customer sees where they sit:
  //   current tier  -> "Current plan" (disabled marker; PlanCard keys off
  //                    plan.current, stamped server-side on the account's tier).
  //   higher tiers  -> the actionable upgrade (CTA targets /v1/billing/upgrade/
  //                    start, swapping the trialing sub's item — no new sub).
  //   lower tiers   -> shown disabled with a Talk-to-sales CTA (downgrades aren't
  //                    self-serve). PlanCard derives this from currentOrder.
  const isTrialing = ent.status === "trialing";
  const plans = state?.plans ?? [];
  const currentOrder = plans.find((p) => p.current)?.tier_order;
  // Render the picker only while trialing AND once we know the current tier
  // (currentOrder drives upgrade-vs-downgrade per card).
  const showPicker = isTrialing && currentOrder != null && plans.length > 0;

  return (
    <Flex direction="column" gap="medium">
      {/* PRIMARY CTA at the top. Direct external link to the billing-service
          redirect (opens a new tab); no in-iframe pre-create fetch. */}
      <LoadingButton
        href={portalStartUrl ? { url: portalStartUrl, external: true } : undefined}
        disabled={!portalStartUrl}
        variant="primary"
      >
        {portalStartUrl ? "Manage billing in Stripe" : "Preparing billing…"}
      </LoadingButton>

      <StatusPanel entitlement={state?.entitlement} />

      <Text format={{ fontStyle: "italic" }}>
        Billing is managed in Stripe across all Growth Operations apps. Use the
        link above to update your plan, payment method, or view invoices.
      </Text>

      {/* Trial-only tier ladder: current (marked), higher (upgradeable), lower
          (disabled, Talk-to-sales). Hidden once active. Upgrading swaps the
          trialing sub onto the higher tier, keeping the trial end date. The full
          `plans` list is passed; PlanCard decides each card's state from
          plan.current + currentOrder. */}
      {showPicker && (
        <PlanGrid
          context={context}
          state={state}
          appKey={appKey}
          plans={plans}
          currentOrder={currentOrder}
          endpoint="upgrade/start"
          ctaLabel="Upgrade to"
          heading="Your plan"
          footnote="Upgrade any time during your trial — your trial end date stays the same, and the new tier applies when it converts. To move to a lower tier, talk to sales."
          openIframe={openIframe}
        />
      )}
    </Flex>
  );
}

function CreditsBilling({ context, state, appKey, openIframe = null }) {
  const onPaidPlan = !!state?.entitlement?.plan;

  // Direct external link to the billing service's GET /v1/billing/portal/start,
  // which resolves the customer + creates the Customer Portal session server-side
  // and 303s to Stripe — IN THE OPENED TAB. No in-iframe portal-session fetch
  // (that round trip hit the billing service's cold-start/CPU stall and surfaced
  // as the iframe's 15s "Gateway took too long" error). Same pattern as
  // PlanGrid's /checkout/start "Choose" button. null (button disabled) until
  // billing_base_url is known.
  const base = state?.billing_base_url ?? null;
  const portalId = context?.portal?.id;
  const returnUrl = state?.app_id
    ? `https://app.hubspot.com/app/${portalId}/${state.app_id}/billing`
    : "https://app.hubspot.com/";
  const portalStartUrl =
    base && appKey && portalId
      ? `${base}/v1/billing/portal/start` +
        `?app_key=${encodeURIComponent(appKey)}` +
        `&portal_id=${encodeURIComponent(String(portalId))}` +
        `&return_url=${encodeURIComponent(returnUrl)}`
      : null;

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
        <LoadingButton
          href={
            portalStartUrl ? { url: portalStartUrl, external: true } : undefined
          }
          disabled={!portalStartUrl}
          variant="primary"
        >
          {portalStartUrl ? "Manage subscription" : "Preparing billing…"}
        </LoadingButton>
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
      <PlanGrid context={context} state={state} appKey={appKey} openIframe={openIframe} />
      {!hasPlans && (
        <LoadingButton
          href={
            portalStartUrl ? { url: portalStartUrl, external: true } : undefined
          }
          disabled={!portalStartUrl}
          variant="primary"
        >
          {portalStartUrl ? "Buy credits in Stripe" : "Preparing billing…"}
        </LoadingButton>
      )}
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

export function BillingTab({ context, state, appKey, openIframe = null }) {
  const mode = state?.entitlement?.mode;

  return (
    <Flex direction="column" gap="medium">
      <Heading>Billing</Heading>
      {mode === "legacy" ? (
        <LegacyBilling state={state} />
      ) : mode === "credits" ? (
        <CreditsBilling context={context} state={state} appKey={appKey} openIframe={openIframe} />
      ) : (
        <TrialSubscriptionBilling context={context} state={state} appKey={appKey} openIframe={openIframe} />
      )}
    </Flex>
  );
}

export default BillingTab;
