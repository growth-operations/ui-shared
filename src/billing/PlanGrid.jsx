import React, { useState } from "react";
import {
  hubspot,
  Flex,
  Tile,
  Text,
  Heading,
  StatusTag,
  LoadingButton,
  Button,
  Link,
  Alert,
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
function PlanCard({ plan, interval, onChoose, choosing, checkoutUrl, supportUrl }) {
  const leg = interval === "annual" ? plan.annual : plan.monthly;
  const periodLabel = interval === "annual" ? "/yr" : "/mo";

  const priceText = plan.talk_to_sales
    ? "Custom"
    : leg
      ? `${fmtMoney(leg.unit_amount, leg.currency)}${periodLabel}`
      : "Free";

  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Flex direction="row" gap="small" align="center">
          <Heading>{plan.name ?? plan.tier}</Heading>
          {plan.current && <StatusTag variant="success">Current plan</StatusTag>}
        </Flex>

        <Text format={{ fontWeight: "bold", fontSize: "lg" }}>{priceText}</Text>

        {plan.credits_per_period != null && (
          <Text>
            {plan.credits_per_period.toLocaleString()} credits / month
          </Text>
        )}

        {(plan.features ?? []).map((f, i) => (
          <Text key={i}>• {f}</Text>
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
        ) : checkoutUrl ? (
          <Button href={{ url: checkoutUrl, external: true }} variant="primary">
            Continue to checkout
          </Button>
        ) : (
          <LoadingButton
            loading={choosing}
            onClick={() => onChoose(plan, leg)}
            variant="primary"
          >
            Choose {plan.name ?? plan.tier}
          </LoadingButton>
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
  const [choosingTier, setChoosingTier] = useState(null);
  // Pre-created checkout URL keyed by `${tier}:${interval}` so a card only shows
  // "Continue to checkout" for the exact price the customer picked.
  const [checkoutUrls, setCheckoutUrls] = useState({});
  const [error, setError] = useState(null);

  if (plans.length === 0) return null;

  const supportUrl = state?.helpful_links?.supportUrl ?? null;

  async function choose(plan, leg) {
    setError(null);
    setChoosingTier(plan.tier);
    try {
      const base = state?.billing_base_url;
      if (!base) throw new Error("Billing service not configured");
      if (!appKey) throw new Error("Missing appKey for checkout");
      const portalId = context?.portal?.id;

      const returnUrl = state?.app_id
        ? `https://app.hubspot.com/app/${portalId}/${state.app_id}/billing`
        : "https://app.hubspot.com/";

      // hubspot.fetch: body is a plain OBJECT (not a JSON string); only
      // Authorization survives as a header — don't set Content-Type.
      const res = await hubspot.fetch(`${base}/v1/billing/checkout`, {
        method: "POST",
        body: {
          app_key: appKey,
          portal_id: String(portalId),
          price_id: leg.price_id,
          return_url: returnUrl,
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Checkout request failed (${res.status}): ${text}`);
      }
      const { url } = await res.json();
      if (!url) throw new Error("No checkout URL returned");
      setCheckoutUrls((prev) => ({ ...prev, [`${plan.tier}:${interval}`]: url }));
    } catch (err) {
      setError(String(err));
    } finally {
      setChoosingTier(null);
    }
  }

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

      {error && (
        <Alert title="Couldn't start checkout" variant="danger">
          <Text>{error}</Text>
        </Alert>
      )}

      <Flex direction="row" gap="medium" wrap="wrap">
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            interval={interval}
            onChoose={choose}
            choosing={choosingTier === plan.tier}
            checkoutUrl={checkoutUrls[`${plan.tier}:${interval}`]}
            supportUrl={supportUrl}
          />
        ))}
      </Flex>

      <Text format={{ fontStyle: "italic" }}>
        Billing is managed in Stripe across all Growth Operations apps. Your new
        credits are added as soon as payment completes.
      </Text>
    </Flex>
  );
}

export default PlanGrid;
