import React, { useEffect, useState } from "react";
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
import { refreshBillingActionTokens } from "../sdk/billing";

// Billing action tokens (see common.billing.action_token) are signed with a
// 5-minute TTL — short enough that a customer who opens the tab and comes
// back later hits an expired Stripe link. Refresh at a fixed interval well
// under that TTL so a normally-paced re-render always has a token with
// several minutes of life left; if a refresh call is slow or fails, the
// still-live token already in state keeps working until the next tick.
const TOKEN_REFRESH_INTERVAL_MS = 3 * 60 * 1000;

// Re-mints state.billing_action_tokens on an interval so long-open tabs never
// hand the customer an expired Stripe link. Returns the latest known token
// set — the initial props value until the first successful refresh, then
// whatever the service last minted. Silently keeps the previous tokens on a
// failed refresh (e.g. transient network blip); the tokens simply expire on
// their own schedule as before this loop existed, which is a strict
// improvement (some refreshes succeeding beats none).
function useRefreshedBillingActionTokens(billingBaseUrl, initialTokens) {
  const [tokens, setTokens] = useState(initialTokens ?? null);

  useEffect(() => {
    setTokens(initialTokens ?? null);
  }, [initialTokens]);

  useEffect(() => {
    const portalToken = initialTokens?.portal;
    if (!billingBaseUrl || !portalToken) return undefined;

    const id = setInterval(() => {
      refreshBillingActionTokens(billingBaseUrl, portalToken)
        .then((fresh) => setTokens(fresh))
        .catch(() => {});
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingBaseUrl, initialTokens?.portal]);

  return tokens;
}

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
    // No active subscription — has_payment_method describes a CARD on file
    // (from a prior/lapsed sub), not whether one's usable here: there's
    // nothing for it to auto-charge. So unlike `trialing` (where a card on
    // file means "nothing to do"), every pending_purchase account needs the
    // SAME next step — pick a plan below — the copy just says so plainly
    // rather than repeating the stale "add a payment method" ask when a
    // card may already exist.
    const resumeCta =
      mode === "credits"
        ? "Choose a plan below to resume."
        : "Choose a plan below to resume syncing your data.";
    return (
      <Alert variant="warning">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>Your free trial has ended</Text>
          <Text>{resumeCta}</Text>
        </Flex>
      </Alert>
    );
  }

  if (status === "canceled") {
    const resumeCta =
      mode === "credits"
        ? "Choose a plan below to start a new subscription."
        : "Choose a plan below to start a new subscription and resume syncing your data.";
    return (
      <Alert variant="warning">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>Your subscription was canceled</Text>
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
  // disabled) until billing_base_url + the signed action token are both known.
  // The endpoint no longer accepts a bare app_key/portal_id (that was an
  // unauthenticated portal-hijack vector) — it requires the `token` the app's
  // own /v1/home minted with its client_secret (state.billing_action_tokens).
  const base = state?.billing_base_url ?? null;
  const portalId = context?.portal?.id;
  const portalToken = state?.billing_action_tokens?.portal ?? null;
  const returnUrl = state?.app_id
    ? `https://app.hubspot.com/app/${portalId}/${state.app_id}/billing`
    : "https://app.hubspot.com/";
  const portalStartUrl =
    base && portalToken
      ? `${base}/v1/billing/portal/start` +
        `?token=${encodeURIComponent(portalToken)}` +
        `&return_url=${encodeURIComponent(returnUrl)}`
      : null;

  // Tier picker — every status needs ONE of two distinct modes, never both:
  //   trialing                    -> UPGRADE mode: a trialing sub already
  //     exists, so a higher-tier click swaps its item in place
  //     (/v1/billing/upgrade/start) rather than starting a second
  //     subscription. Lower tiers show disabled (Talk-to-sales; downgrades
  //     aren't self-serve). currentOrder is REQUIRED here so PlanCard can
  //     tell upgrade from downgrade.
  //   pending_purchase / canceled -> CHECKOUT mode: there is NO active
  //     subscription to swap — every tier is a genuinely fresh purchase
  //     (/v1/billing/checkout/start, PlanGrid's default). currentOrder is
  //     intentionally omitted (undefined) so no tier reads as a downgrade;
  //     with nothing active, every tier is just a plan to start.
  // Never both at once: a customer either has a subscription to adjust
  // (upgrade) or doesn't (checkout) — showing the upgrade endpoint with no
  // real subscription behind it would 404/error at click time.
  const isTrialing = ent.status === "trialing";
  const needsCheckout =
    ent.status === "pending_purchase" || ent.status === "canceled";
  const plans = state?.plans ?? [];
  const currentOrder = isTrialing
    ? plans.find((p) => p.current)?.tier_order
    : undefined;
  // Trialing: only once we know the current tier (currentOrder drives
  // upgrade-vs-downgrade per card). Checkout: as soon as there's a catalog
  // to pick from — there's no "current tier" gate to wait on.
  const showPicker =
    (isTrialing && currentOrder != null && plans.length > 0) ||
    (needsCheckout && plans.length > 0);

  return (
    <Flex direction="column" gap="medium">
      {/* PRIMARY CTA when there's an existing subscription to manage
          (trialing/active/past_due). For pending_purchase/canceled there is
          nothing for the Stripe Customer Portal to manage — the plan picker
          below is the actual recovery path, so this becomes a secondary
          link rather than the primary action. */}
      <LoadingButton
        href={portalStartUrl ? { url: portalStartUrl, external: true } : undefined}
        disabled={!portalStartUrl}
        variant={needsCheckout ? "secondary" : "primary"}
      >
        {portalStartUrl ? "Manage billing in Stripe" : "Preparing billing…"}
      </LoadingButton>

      <StatusPanel entitlement={state?.entitlement} />

      <Text format={{ fontStyle: "italic" }}>
        {needsCheckout
          ? "Choose a plan below to resume. Once you have an active subscription, use the link above to manage payment methods or view invoices."
          : "Billing is managed in Stripe across all Growth Operations apps. Use the link above to update your plan, payment method, or view invoices."}
      </Text>

      {/* Trialing: current (marked), higher (upgradeable), lower (disabled,
          Talk-to-sales) — upgrading swaps the trialing sub onto the higher
          tier, keeping the trial end date. pending_purchase/canceled: every
          tier plain-actionable (fresh checkout, PlanGrid's default props/
          endpoint) — no currentOrder means PlanCard never marks a downgrade.
          The full `plans` list is passed either way; PlanCard decides each
          card's state from plan.current + currentOrder. */}
      {showPicker && (
        <PlanGrid
          context={context}
          state={state}
          appKey={appKey}
          plans={plans}
          currentOrder={currentOrder}
          endpoint={needsCheckout ? "checkout/start" : "upgrade/start"}
          ctaLabel={needsCheckout ? "Choose" : "Upgrade to"}
          heading={needsCheckout ? "Choose a plan to resume" : "Your plan"}
          footnote={
            needsCheckout
              ? "Choose a plan to start a new subscription and resume syncing your data."
              : "Upgrade any time during your trial — your trial end date stays the same, and the new tier applies when it converts. To move to a lower tier, talk to sales."
          }
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
  // billing_base_url + the signed action token are both known — the endpoint no
  // longer accepts a bare app_key/portal_id (state.billing_action_tokens).
  const base = state?.billing_base_url ?? null;
  const portalId = context?.portal?.id;
  const portalToken = state?.billing_action_tokens?.portal ?? null;
  const returnUrl = state?.app_id
    ? `https://app.hubspot.com/app/${portalId}/${state.app_id}/billing`
    : "https://app.hubspot.com/";
  const portalStartUrl =
    base && portalToken
      ? `${base}/v1/billing/portal/start` +
        `?token=${encodeURIComponent(portalToken)}` +
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

function CompedBilling() {
  return (
    <Alert variant="success">
      <Flex direction="column" gap="extra-small">
        <Text format={{ fontWeight: "bold" }}>Free access</Text>
        <Text>
          Your account has been granted complimentary access as a Growth Operations partner or
          team member. No payment method or subscription is required.
        </Text>
      </Flex>
    </Alert>
  );
}

export function BillingTab({ context, state, appKey, openIframe = null }) {
  const mode = state?.entitlement?.mode;
  const isSuperAdmin = state?.user?.is_super_admin === true;

  // Keep the billing action tokens (portal/checkout/upgrade Stripe links)
  // fresh for as long as this tab stays open. Overriding billing_action_tokens
  // on a copy of `state` means every descendant (TrialSubscriptionBilling,
  // CreditsBilling, PlanGrid) picks up refreshed tokens through the same
  // `state?.billing_action_tokens` reads they already had — no prop threading.
  const refreshedTokens = useRefreshedBillingActionTokens(
    state?.billing_base_url,
    state?.billing_action_tokens
  );
  const billingState =
    refreshedTokens && refreshedTokens !== state?.billing_action_tokens
      ? { ...state, billing_action_tokens: refreshedTokens }
      : state;

  return (
    <Flex direction="column" gap="medium">
      <Heading>Billing</Heading>
      {!isSuperAdmin ? (
        <Alert variant="warning" title="Access restricted">
          <Text>Billing settings are only available to super admins.</Text>
        </Alert>
      ) : mode === "legacy" ? (
        <LegacyBilling state={billingState} />
      ) : mode === "credits" ? (
        <CreditsBilling context={context} state={billingState} appKey={appKey} openIframe={openIframe} />
      ) : mode === "comped" ? (
        <CompedBilling />
      ) : (
        <TrialSubscriptionBilling context={context} state={billingState} appKey={appKey} openIframe={openIframe} />
      )}
    </Flex>
  );
}

export default BillingTab;
