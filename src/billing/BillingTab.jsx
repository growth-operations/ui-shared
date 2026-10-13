import React, { useEffect, useState } from "react";
import {
  Flex,
  Heading,
  Text,
  Tile,
  LoadingButton,
  Button,
  Alert,
  Link,
  LoadingSpinner,
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "@hubspot/ui-extensions";
import { fmtDate, fmtMoney, daysUntil, SUPPORT_FOOTER } from "../lib/format";
import { useStrictModeEffect } from "../lib/useStrictModeEffect";
import { CreditMeter } from "../home/CreditMeter";
import { PlanGrid } from "./PlanGrid";
import { AutoProvisionToggle } from "./AutoProvisionToggle";
import { resolveAutoProvision } from "../lib/autoProvision";
import { refreshBillingActionTokens } from "../sdk/billing";
import { getInvoices } from "../sdk/app/topUps";

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
//
// plansAvailable / restartAvailable describe what the canceled customer can
// actually SEE below the panel (exported for tests). When a catalog gap
// leaves plans EMPTY (2026-10-13 sparkfly incident) the "below" copy would
// promise a grid that isn't there — so it swaps to copy that matches the
// standalone restart button (or, without a restart token, the Stripe link
// above), plus the support footer the dead end needs.
export function StatusPanel({ entitlement, plansAvailable = true, restartAvailable = false }) {
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
    // Scheduled-cancel (cancel_at_period_end) is a WARNING, not a success:
    // access ends at the period boundary unless the customer acts. The "Keep
    // my subscription" button lives beside this panel (TrialSubscriptionBilling
    // has the billing_base_url + restart token; StatusPanel only sees the
    // entitlement).
    if (cancel_at_period_end) {
      return (
        <Alert variant="warning">
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: "bold" }}>
              Your subscription is set to cancel
            </Text>
            <Text>
              It stays active until {fmtDate(current_period_end)}, then your
              data stops syncing. Changed your mind? Keep it below — no
              re-checkout needed.
            </Text>
          </Flex>
        </Alert>
      );
    }
    return (
      <Alert variant="success">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>You're all set</Text>
          <Text>
            Your subscription is active. Next renewal:{" "}
            {fmtDate(current_period_end)}.
          </Text>
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
    // plansAvailable === false means the catalog mirror came back EMPTY — no
    // grid renders below, so the copy must not say "below". With a restart
    // token the standalone one-click restart button (rendered under this
    // panel) is the recovery path; without one, the Stripe link above is.
    const resumeCta = !plansAvailable
      ? restartAvailable
        ? "Restart your previous plan in one click — we charge your card on file and your data starts syncing again."
        : "Manage your billing in Stripe with the link above to resume — your data starts syncing again."
      : mode === "credits"
        ? "Choose a plan below to start a new subscription."
        : "Restart your previous plan below in one click, or choose a different one — either way your data starts syncing again.";
    return (
      <Alert variant="warning">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "bold" }}>Your subscription was canceled</Text>
          <Text>{resumeCta}</Text>
          {!plansAvailable && (
            <Text variant="microcopy">{SUPPORT_FOOTER}</Text>
          )}
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

// Exported for tests (the canceled/empty-catalog restart fallback).
export function TrialSubscriptionBilling({ context, state, appKey, openIframe = null }) {
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

  // "Keep my subscription" for a sub flagged cancel_at_period_end: hits
  // /v1/billing/restart/start with NO price_id — the uncancel branch flips the
  // flag off in place (the one true resume Stripe supports) and 303s back
  // here. Null (button hidden, not disabled) until the restart token exists —
  // an older backend that doesn't mint it simply doesn't show the button; the
  // Stripe portal still offers the same renewal as a fallback.
  const restartToken = state?.billing_action_tokens?.restart ?? null;
  const keepSubscriptionUrl =
    base && restartToken
      ? `${base}/v1/billing/restart/start` +
        `?token=${encodeURIComponent(restartToken)}` +
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
  const isCanceled = ent.status === "canceled";
  const needsCheckout = ent.status === "pending_purchase" || isCanceled;
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

  // Empty-catalog restart fallback (2026-10-13 sparkfly incident): a catalog
  // data gap can leave `plans` EMPTY for a canceled account — showPicker then
  // hides the grid while the panel copy still promised one. With no grid to
  // pick from, the one-click restart becomes THE recovery path: a standalone
  // primary button hitting /v1/billing/restart/start with NO price_id (the
  // billing service resolves the account's last subscription price
  // server-side). Requires the restart action token; legacy/Anvil-mode
  // entitlements are excluded defensively (BillingTab's mode switch already
  // routes mode "legacy" to LegacyBilling, so this arm is unreachable for
  // them — the guard keeps it that way if the switch ever changes).
  const standaloneRestartUrl =
    isCanceled && plans.length === 0 && ent.mode !== "legacy"
      ? keepSubscriptionUrl
      : null;

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

      <StatusPanel
        entitlement={state?.entitlement}
        plansAvailable={!needsCheckout || plans.length > 0}
        restartAvailable={standaloneRestartUrl != null}
      />

      {/* Scheduled-cancel on an ACTIVE sub: one click flips
          cancel_at_period_end off in place (no re-checkout, no new sub) —
          the /v1/billing/restart/start uncancel branch. Rendered only when
          the restart token exists (see keepSubscriptionUrl above). */}
      {ent.status === "active" && ent.cancel_at_period_end && keepSubscriptionUrl && (
        <Button href={{ url: keepSubscriptionUrl, external: true }} variant="primary">
          Keep my subscription
        </Button>
      )}

      {/* CANCELED with an EMPTY catalog (no grid to pick from): the
          price_id-less one-click restart is the recovery path, rendered
          under the status panel. Reuses keepSubscriptionUrl — the restart
          endpoint never needed a price_id client-side. */}
      {standaloneRestartUrl && (
        <Button href={{ url: standaloneRestartUrl, external: true }} variant="primary">
          Restart your previous plan
        </Button>
      )}

      <Text format={{ fontStyle: "italic" }}>
        {needsCheckout
          ? isCanceled && plans.length === 0
            ? standaloneRestartUrl
              ? "Restart charges your card on file and resumes syncing immediately — no checkout page. Once you have an active subscription, use the link above to manage payment methods or view invoices."
              : "Once you have an active subscription, use the link above to manage payment methods or view invoices."
            : "Choose a plan below to resume. Once you have an active subscription, use the link above to manage payment methods or view invoices."
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
          heading={
            isCanceled
              ? "Resume your subscription"
              : needsCheckout
                ? "Choose a plan to resume"
                : "Your plan"
          }
          footnote={
            isCanceled
              ? "Restart charges your card on file and resumes syncing immediately — no checkout page. If the card needs updating, we'll send you to Stripe to finish. You can also switch to a different plan or billing interval."
              : needsCheckout
                ? "Choose a plan to start a new subscription and resume syncing your data."
                : "Upgrade any time during your trial — your trial end date stays the same, and the new tier applies when it converts. To move to a lower tier, talk to sales."
          }
          // Canceled only: the account's last tier is still stamped
          // `current` (account.plan persists after cancel), so its card
          // becomes the one-click "Restart <plan>" CTA (/v1/billing/
          // restart/start — recreate off-session on the saved card, with a
          // hosted-Checkout fallback server-side) instead of a disabled
          // "Current plan" marker. Other tiers stay plain checkout.
          resumeCurrentPlan={isCanceled}
          openIframe={openIframe}
        />
      )}
    </Flex>
  );
}

// Invoice status -> label (Stripe's vocabulary: paid / open / void /
// uncollectible; drafts and $0 voids are filtered server-side).
const INVOICE_STATUS_LABELS = {
  paid: "Paid",
  open: "Open",
  void: "Void",
  uncollectible: "Uncollectible",
};

// The invoice-history table itself — pure rendering (exported for tests);
// fetch/loading/error live in InvoiceHistory below.
export function InvoiceHistoryTable({ invoices }) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Date</TableHeader>
          <TableHeader>Description</TableHeader>
          <TableHeader>Amount</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Receipt</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {invoices.map((invoice, i) => (
          <TableRow key={`${invoice.id ?? invoice.date}-${i}`}>
            <TableCell>{fmtDate(invoice.date)}</TableCell>
            <TableCell>{invoice.description}</TableCell>
            <TableCell>{fmtMoney(invoice.amount_cents, invoice.currency)}</TableCell>
            <TableCell>
              {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status ?? "—"}
            </TableCell>
            <TableCell>
              {invoice.hosted_invoice_url ? (
                <Link href={{ url: invoice.hosted_invoice_url, external: true }}>
                  Receipt
                </Link>
              ) : (
                "—"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// "Invoice history" — every Stripe invoice on the portal's customer
// (subscription renewals, one-off charges, additional-credit purchases —
// including VOIDED top-ups, which tell the decline story), from the billing
// service's GET /v1/billing/invoices (newest first, capped at 24). This is
// the one purchase history surface now — the old Top-Up History section is
// gone (Andrew's 2026-10 feedback); the base service keeps its deprecated
// GET billing/top-ups empty-list stub so OLD released clients degrade
// silently.
//
// Auth is the billing action token (the claim scopes the response to THIS
// portal's Stripe customer). BillingTab re-mints the token set every 3
// minutes; depending on the token means the list also quietly refreshes on
// that cadence while the tab stays open — a top-up that completes mid-session
// shows up without a reload.
//
// Two "render nothing" degradations: no billing_base_url / token yet (an
// older backend that doesn't mint them — same "hidden until token exists"
// posture as the restart link), and a 404 from a billing service that
// predates the invoices route (hide the section instead of erroring forever
// until the service's next deploy).
function InvoiceHistory({ billingBaseUrl, billingActionToken }) {
  const [status, setStatus] = useState("loading"); // loading | ready | error | unsupported
  const [invoices, setInvoices] = useState([]);

  useStrictModeEffect(
    async ({ mounted }) => {
      try {
        const res = await getInvoices({
          billingBaseUrl,
          token: billingActionToken,
        });
        if (mounted.current) {
          setInvoices(res?.invoices ?? []);
          setStatus("ready");
        }
      } catch (e) {
        if (mounted.current) {
          setStatus(e?.statusCode === 404 ? "unsupported" : "error");
        }
      }
    },
    [billingBaseUrl, billingActionToken]
  );

  if (!billingBaseUrl || !billingActionToken || status === "unsupported") {
    return null;
  }
  if (status === "loading") {
    return <LoadingSpinner showLabel label="Loading invoices…" />;
  }
  if (status === "error") {
    return (
      <Alert title="Couldn't load invoice history" variant="warning">
        <Text>Refresh the page to try again.</Text>
      </Alert>
    );
  }

  return (
    <Flex direction="column" gap="small">
      <Heading>Invoice history</Heading>
      {invoices.length === 0 ? (
        <Text format={{ fontStyle: "italic" }}>
          No invoices yet. Subscription renewals, one-off charges, and
          additional-credit purchases are listed here.
        </Text>
      ) : (
        <InvoiceHistoryTable invoices={invoices} />
      )}
    </Flex>
  );
}

// Exported for tests (the billing_model gating of the top-up sections).
export function CreditsBilling({ context, state, appKey, openIframe = null }) {
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

  // PAID: an UPGRADE-ONLY picker, same trial-archetype pattern as
  // TrialSubscriptionBilling above — higher tiers are one-click in-app via
  // /v1/billing/upgrade/start, which swaps the EXISTING subscription's item
  // in place (never a new Checkout session), so a click here can never
  // double-bill. currentOrder (this tier's rank) makes PlanCard mark the
  // current tier and disable everything ranked below it ("Talk to sales to
  // switch") — the backend independently re-validates the same upgrade
  // direction (start_upgrade_redirect's tier_order check), so this is safe
  // even if currentOrder were ever wrong. Downgrade is intentionally NOT
  // self-serve (policy, not a Stripe portal gap): PlanCard's own
  // "Talk to sales to switch" is the one and only downgrade path. Cancel /
  // payment method / invoices still go through the Stripe Customer Portal
  // link below — the footnote must not imply Manage subscription can also
  // downgrade (some apps' Stripe portal config has subscription_update
  // disabled anyway, so it silently couldn't even if we wanted it to).
  if (onPaidPlan) {
    const plans = state?.plans ?? [];
    const currentOrder = plans.find((p) => p.current)?.tier_order;
    const showPicker = currentOrder != null && plans.length > 0;
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
        {showPicker ? (
          <PlanGrid
            context={context}
            state={state}
            appKey={appKey}
            currentOrder={currentOrder}
            endpoint="upgrade/start"
            ctaLabel="Upgrade to"
            heading="Your plan"
            footnote="Upgrade any time — the new tier applies immediately with prorated billing. To move to a lower tier, contact us. Use Manage subscription above to cancel or update your payment method."
            openIframe={openIframe}
          />
        ) : (
          <Text format={{ fontStyle: "italic" }}>
            Change or cancel your plan in Stripe — billing is managed across all
            Growth Operations apps.
          </Text>
        )}
        {/* Top-up ("bank") model surfaces — gated on the entitlement arm's
            billing_model discriminator. "metered" accounts never top up, so
            the sections would be permanently empty; backends that predate the
            field don't have the endpoints at all. Both cases hide the
            sections (the safe direction — no dead UI). */}
        {state?.entitlement?.billing_model === "topup" && (
          <>
            {/* Invoice history is the one purchase list now (Top-Up History
                is deleted — Andrew's 2026-10 feedback). `state` here is
                BillingTab's interval-refreshed copy, so the token is re-minted
                every 3 minutes; InvoiceHistory hides itself when the backend
                or billing service predates the pieces it needs. */}
            <InvoiceHistory
              billingBaseUrl={base}
              billingActionToken={state?.billing_action_tokens?.portal ?? null}
            />
            {/* "Add Additional Credits Automatically" — REPLACES the old
                billing-limit control. The flag resolves from
                state.auto_provision (default ON); the ON→OFF direction parks
                in Andrew's exact confirmation copy. */}
            <AutoProvisionToggle
              context={context}
              appKey={appKey}
              enabled={resolveAutoProvision(state?.auto_provision).enabled}
              appName={state?.app?.name ?? "this app"}
              // The POST's second auth dep (see setAutoProvision). `state`
              // here is BillingTab's interval-refreshed copy, so this token is
              // re-minted every 3 minutes — a long-open tab never POSTs an
              // expired one.
              billingActionToken={state?.billing_action_tokens?.portal ?? null}
            />
          </>
        )}
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
