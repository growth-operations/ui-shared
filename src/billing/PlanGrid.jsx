import React, { useState } from "react";
import {
  Flex,
  AutoGrid,
  Tile,
  Text,
  Heading,
  StatusTag,
  Button,
  ToggleGroup,
} from "@hubspot/ui-extensions";
import { fmtMoney } from "../lib/format";

// The credit-app upgrade path: a dynamically-rendered grid of the pickable
// plans (tiers) a customer can move to, driven entirely by the backend `plans`
// block (CONTRACT.md → common.billing.catalog.get_plans). The shared package is
// presentational — it never hardcodes tiers/prices/features; everything comes
// from the Stripe catalog mirror via the payload.
//
// Per-tier checkout follows the §5.3 UI-extension gotchas: Stripe can't be
// iframed and there's no open-URL action — only <Link>/Button-with-href, whose
// href must exist before render. So a tier's "Choose" click POSTs to the
// billing service to PRE-CREATE a hosted checkout session for that price_id,
// then renders the returned URL as an external link the customer clicks. The
// extension can't read Stripe's redirect params (sandboxed iframe), so the
// post-payment credit grant is server-side (Stripe webhook → grant_credits).
//
// Props:
//   context — UI-extension serverless context (context.portal.id).
//   state   — the /v1/home payload (plans[], billing_base_url, app_id).
//   appKey  — the billing app_key for THIS app (always a prop, never hardcoded).

// One plan card. Shows tier name, price for the selected interval, credits,
// feature bullets, and a CTA: "Current" (disabled) for the active tier,
// "Contact sales" for talk_to_sales tiers, else "Choose" which pre-creates a
// checkout session for that tier's price in the selected interval.
//
// The Monthly/Annual toggle is PER CARD (not a single grid-wide switch): a tier
// may offer one interval and not the other (e.g. a top tier that's monthly-only),
// so each card owns its own interval state and only shows the toggle when it has
// BOTH legs. A subscription still bills on one cadence — the cadence bought is
// whatever this card's toggle shows when its "Choose" is clicked.
function PlanCard({
  plan,
  billingBaseUrl,
  appKey,
  portalId,
  returnUrl,
  supportUrl,
  maxFeatures = 0,
  // Billing-service redirect the "Choose" button targets. "checkout/start" (the
  // default) starts a NEW subscription via hosted Checkout — for free/credit
  // first purchase. "upgrade/start" swaps the EXISTING trialing/active sub's item
  // to this tier (the trial-archetype in-app upgrade) — no new sub.
  endpoint = "checkout/start",
  ctaLabel = "Choose",
  // Trial-picker only: tier_order of the customer's current tier. When set, a
  // card ranked BELOW it is a downgrade — shown for context but not self-serve
  // (downgrades go through support), so it renders disabled with a Talk-to-sales
  // CTA. Cards ranked ABOVE are upgrades (the normal CTA). null/undefined => the
  // credit first-purchase grid, where this relation doesn't apply.
  currentOrder = null,
  // actions.openIframeModal from the card root (threaded BillingTab → PlanGrid).
  // When present, a talk_to_sales tier with plan.meetings_url opens the meetings
  // scheduler in an IN-CARD modal (the Anvil "Meet with Andrew" experience).
  // Absent (or no meetings_url) → fall back to a new-tab href. UI Extensions
  // can't read whether the external meetings page is CSP-frameable, so the modal
  // is best-effort; the href fallback always works.
  openIframe = null,
}) {
  // Default this card to annual when it offers annual (cheaper-per-month story);
  // monthly-only tiers default to monthly. Both legs → show the toggle.
  const hasMonthly = !!plan.monthly;
  const hasAnnual = !!plan.annual;
  // A lower-ranked tier than the customer's current one: a downgrade. Not
  // self-serve (changes go through support) — show it for context, disabled,
  // with a Talk-to-sales CTA. Only meaningful in the trial picker (currentOrder
  // set); never flag the current tier itself as a downgrade.
  const isDowngrade =
    currentOrder != null &&
    !plan.current &&
    plan.tier_order != null &&
    plan.tier_order < currentOrder;
  // The interval toggle is only useful when the card can be acted on; a current
  // or downgrade card is read-only, so hide its toggle.
  const canToggle = hasMonthly && hasAnnual && !plan.current && !isDowngrade;
  const [interval, setInterval] = useState(hasAnnual ? "annual" : "monthly");
  const leg = interval === "annual" ? plan.annual : plan.monthly;
  const periodLabel = interval === "annual" ? "/yr" : "/mo";

  const priceText = plan.talk_to_sales
    ? "Custom"
    : leg
      ? `${fmtMoney(leg.unit_amount, leg.currency)}${periodLabel}`
      : "Free";

  // Annual savings vs. paying monthly for a year. Only when this card is showing
  // annual AND has both legs to compare. annualFull = the struck-through "12×
  // monthly" reference price; pct = the highlighted discount.
  const showAnnualSavings =
    interval === "annual" && hasMonthly && hasAnnual && plan.annual?.unit_amount;
  const annualFull = showAnnualSavings ? plan.monthly.unit_amount * 12 : null;
  const savingsPct =
    showAnnualSavings && annualFull > plan.annual.unit_amount
      ? Math.round((1 - plan.annual.unit_amount / annualFull) * 100)
      : 0;

  // Direct one-click checkout link to the billing service's redirect endpoint.
  // Null until we have everything (billing host, appKey, portal, this interval's
  // price) — the button is disabled until then.
  const startUrl =
    billingBaseUrl && appKey && portalId && leg?.price_id
      ? `${billingBaseUrl}/v1/billing/${endpoint}` +
        `?app_key=${encodeURIComponent(appKey)}` +
        `&portal_id=${encodeURIComponent(portalId)}` +
        `&price_id=${encodeURIComponent(leg.price_id)}` +
        `&return_url=${encodeURIComponent(returnUrl ?? "")}`
      : null;

  const features = plan.features ?? [];
  // Align the CTA buttons across cards. HubSpot's column Flex does NOT stretch
  // to the Tile height (AutoGrid equalizes the card height but flex={1}/justify
  // had no vertical room to consume — verified in QA), so we can't push the CTA
  // down with flex. Instead make the cards' CONTENT equal height: pad each
  // feature list to maxFeatures with non-breaking-space spacer lines (a plain
  // space collapses to zero height;   renders a real line). The CTAs then
  // naturally land at the same y.
  const padCount = Math.max(0, maxFeatures - features.length);

  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Flex direction="row" gap="small" align="center">
          <Heading>{plan.name ?? plan.tier}</Heading>
          {plan.current && (
            <StatusTag variant="success">Current plan</StatusTag>
          )}
        </Flex>

        <Flex direction="row" gap="small" align="center">
          <Text format={{ fontWeight: "bold", fontSize: "lg" }}>{priceText}</Text>
          {savingsPct > 0 && (
            <StatusTag variant="success">Save {savingsPct}%</StatusTag>
          )}
        </Flex>
        {/* Struck-through "12× monthly" reference so the annual discount reads. */}
        {savingsPct > 0 && (
          <Text format={{ lineDecoration: "strikethrough", fontStyle: "italic" }}>
            {fmtMoney(annualFull, plan.annual.currency)}/yr
          </Text>
        )}

        {/* Per-card interval toggle — only when this tier offers both legs. */}
        {canToggle && (
          <ToggleGroup
            name={`billing-interval-${plan.tier}`}
            toggleType="radioButtonList"
            inline={true}
            value={interval}
            onChange={(v) => v && setInterval(v)}
            options={[
              { label: "Monthly", value: "monthly" },
              { label: "Annual", value: "annual" },
            ]}
          />
        )}

        {plan.credits_per_period != null && (
          <Text>{plan.credits_per_period.toLocaleString()} credits / month</Text>
        )}

        {features.map((f, i) => (
          <Text key={i}>• {f}</Text>
        ))}
        {Array.from({ length: padCount }).map((_, i) => (
          <Text key={`pad-${i}`}>{" "}</Text>
        ))}

        {/* CTA. Current tier => disabled marker. Downgrade (lower than current,
            trial picker) => disabled + Talk-to-sales (not self-serve).
            talk_to_sales tier => contact link. Otherwise pre-create-then-link
            checkout/upgrade for the selected interval. */}
        {plan.current ? (
          <Button disabled>Current plan</Button>
        ) : isDowngrade ? (
          <Button
            href={supportUrl ? { url: supportUrl, external: true } : undefined}
            disabled={!supportUrl}
            variant="secondary"
          >
            Talk to sales to switch
          </Button>
        ) : plan.talk_to_sales ? (
          // Talk-to-sales tier (e.g. Enterprise+): no price/checkout. If we have
          // a meetings link AND the openIframeModal action, open the scheduler in
          // an in-card modal (Anvil "Meet with Andrew"). Otherwise a new-tab href
          // to the meetings link (preferred) or support page.
          openIframe && plan.meetings_url ? (
            <Button
              variant="secondary"
              onClick={() =>
                openIframe({
                  uri: plan.meetings_url,
                  title: `Talk to sales — ${plan.name ?? plan.tier}`,
                  width: 1100,
                  height: 760,
                })
              }
            >
              Talk to sales
            </Button>
          ) : (
            <Button
              href={
                plan.meetings_url
                  ? { url: plan.meetings_url, external: true }
                  : supportUrl
                    ? { url: supportUrl, external: true }
                    : undefined
              }
              disabled={!plan.meetings_url && !supportUrl}
              variant="secondary"
            >
              Talk to sales
            </Button>
          )
        ) : !leg ? (
          // No price for the selected interval (e.g. annual not offered) — guide
          // the customer to the other toggle rather than dead-ending.
          <Text format={{ fontStyle: "italic" }}>
            Not available {interval === "annual" ? "annually" : "monthly"}
          </Text>
        ) : (
          // One-click: the button is a DIRECT external link to the billing
          // service's GET /checkout/start, which creates the Stripe session
          // server-side (in the opened tab) and 302s to Stripe. No in-iframe
          // pre-create fetch — avoids the old two-click flow + the 15s iframe
          // timeout. startUrl is null until billing_base_url is known.
          <Button
            href={startUrl ? { url: startUrl, external: true } : undefined}
            disabled={!startUrl}
            variant="primary"
          >
            {ctaLabel} {plan.name ?? plan.tier}
          </Button>
        )}
      </Flex>
    </Tile>
  );
}

export function PlanGrid({
  context,
  state,
  appKey,
  // Customization for non-default uses. The credit-app first-purchase grid uses
  // all defaults; the trial-archetype in-app UPGRADE picker passes:
  //   plans={higherTiersOnly}  endpoint="upgrade/start"  ctaLabel="Upgrade to"
  //   heading="Upgrade your plan"  footnote={trial copy}
  plans: plansOverride,
  endpoint = "checkout/start",
  ctaLabel = "Choose",
  heading = "Plans",
  footnote = "Billing is managed in Stripe across all Growth Operations apps. Your new credits are added as soon as payment completes.",
  // Trial-picker only: tier_order of the current tier, so cards below it render
  // as disabled downgrades (Talk-to-sales). Omitted for the credit grid.
  currentOrder = null,
  // actions.openIframeModal (from the hosting card root) — lets a talk_to_sales
  // tier open its meetings_url scheduler in an in-card modal. Optional.
  openIframe = null,
}) {
  const plans = plansOverride ?? state?.plans ?? [];

  if (plans.length === 0) return null;

  const supportUrl = state?.helpful_links?.supportUrl ?? null;
  const billingBaseUrl = state?.billing_base_url ?? null;
  const portalId = context?.portal?.id;
  // Where Stripe sends the customer back after pay/cancel — the app's Billing
  // tab. The card builds the one-click /checkout/start link from these.
  const returnUrl = state?.app_id
    ? `https://app.hubspot.com/app/${portalId}/${state.app_id}/billing`
    : "https://app.hubspot.com/";
  // Max feature count across cards — each card pads to this so all cards share
  // content height and the CTAs align (see PlanCard comment).
  const maxFeatures = plans.reduce(
    (m, p) => Math.max(m, (p.features ?? []).length),
    0
  );

  return (
    <Flex direction="column" gap="medium">
      <Heading>{heading}</Heading>

      {/* AutoGrid(flexible): equal-width columns that wrap responsively. Card
          height is equalized via the maxFeatures padding in PlanCard. Each card
          owns its own Monthly/Annual toggle (see PlanCard). */}
      <AutoGrid columnWidth={240} flexible={true} gap="medium">
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            billingBaseUrl={billingBaseUrl}
            appKey={appKey}
            portalId={portalId}
            returnUrl={returnUrl}
            supportUrl={supportUrl}
            maxFeatures={maxFeatures}
            endpoint={endpoint}
            ctaLabel={ctaLabel}
            currentOrder={currentOrder}
            openIframe={openIframe}
          />
        ))}
      </AutoGrid>

      <Text format={{ fontStyle: "italic" }}>{footnote}</Text>
    </Flex>
  );
}

export default PlanGrid;
