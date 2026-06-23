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
function PlanCard({
  plan,
  interval,
  billingBaseUrl,
  appKey,
  portalId,
  returnUrl,
  supportUrl,
  maxFeatures = 0,
}) {
  const leg = interval === "annual" ? plan.annual : plan.monthly;
  const periodLabel = interval === "annual" ? "/yr" : "/mo";

  const priceText = plan.talk_to_sales
    ? "Custom"
    : leg
      ? `${fmtMoney(leg.unit_amount, leg.currency)}${periodLabel}`
      : "Free";

  // Direct one-click checkout link to the billing service's redirect endpoint.
  // Null until we have everything (billing host, appKey, portal, this interval's
  // price) — the button is disabled until then.
  const startUrl =
    billingBaseUrl && appKey && portalId && leg?.price_id
      ? `${billingBaseUrl}/v1/billing/checkout/start` +
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

        <Text format={{ fontWeight: "bold", fontSize: "lg" }}>{priceText}</Text>

        {plan.credits_per_period != null && (
          <Text>{plan.credits_per_period.toLocaleString()} credits / month</Text>
        )}

        {features.map((f, i) => (
          <Text key={i}>• {f}</Text>
        ))}
        {Array.from({ length: padCount }).map((_, i) => (
          <Text key={`pad-${i}`}>{" "}</Text>
        ))}

        {/* CTA. Current tier => disabled marker. talk_to_sales => contact link.
            Otherwise pre-create-then-link checkout for the selected interval. */}
        {plan.current ? (
          <Button disabled>Current plan</Button>
        ) : plan.talk_to_sales ? (
          <Button
            href={supportUrl ? { url: supportUrl, external: true } : undefined}
            disabled={!supportUrl}
            variant="secondary"
          >
            Contact sales
          </Button>
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
            Choose {plan.name ?? plan.tier}
          </Button>
        )}
      </Flex>
    </Tile>
  );
}

export function PlanGrid({ context, state, appKey }) {
  const plans = state?.plans ?? [];
  // Default to annual only if EVERY paid plan offers it; else monthly.
  const paid = plans.filter((p) => !p.talk_to_sales && (p.monthly || p.annual));
  const annualAvailable =
    paid.length > 0 && paid.every((p) => p.annual);
  const [interval, setInterval] = useState(annualAvailable ? "annual" : "monthly");

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
      <Flex direction="row" gap="medium" align="center" justify="start">
        <Heading>Plans</Heading>
        {annualAvailable && (
          <ToggleGroup
            name="billing-interval"
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
      </Flex>

      {/* AutoGrid(flexible): equal-width columns that wrap responsively. Card
          height is equalized via the maxFeatures padding in PlanCard. */}
      <AutoGrid columnWidth={240} flexible={true} gap="medium">
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            interval={interval}
            billingBaseUrl={billingBaseUrl}
            appKey={appKey}
            portalId={portalId}
            returnUrl={returnUrl}
            supportUrl={supportUrl}
            maxFeatures={maxFeatures}
          />
        ))}
      </AutoGrid>

      <Text format={{ fontStyle: "italic" }}>
        Billing is managed in Stripe across all Growth Operations apps. Your new
        credits are added as soon as payment completes.
      </Text>
    </Flex>
  );
}

export default PlanGrid;
