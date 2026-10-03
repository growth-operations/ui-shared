import React from "react";
import { Flex, Text, Alert, Button } from "@hubspot/ui-extensions";
import { resolveBillingBanner } from "../lib/creditDisplay";

// Shared app-wide billing banner for the credit archetype (CreditState.
// to_entitlement's credits arm). Meant to sit in the app's layout/shell
// (rendered above every route), NOT inside the Billing tab itself — it's the
// "surface this everywhere, not just on the Billing page" nudge.
//
// Driven by the entitlement arm's `threshold_state` (the top-up/"bank"
// billing model):
//   top_up_pending -> calm info ("Adding credits automatically…"), no CTA
//   top_up_failed  -> error, "Update payment method" CTA out to the Stripe
//                     billing-portal entry point (/v1/billing/portal/start)
//   limit_reached  -> warning, "Raise your billing limit" CTA into the
//                     Billing tab's limit control
//   depleted       -> error, BLOCKING wording — on the topup model a PAID
//                     plan blocks at true zero (pool + bank empty, no
//                     successful top-up): actions are paused until the next
//                     billing period or a successful top-up.
//
// Legacy metered accounts are unchanged: they only ever see threshold_state
// "healthy"/"depleted" with over_included doing the talking — overage is
// "paying overage, not blocked" (the 2026-09-02 incident: a paid account
// correctly kept working while a banner showed blocking "out of credits"
// copy). The branch logic lives in ../lib/creditDisplay (unit-tested) —
// consume this instead of re-implementing it.
//
// Props:
//   state       — the /v1/home payload (entitlement union). Renders nothing
//                 outside the credits archetype or before install completes.
//   actionLabel — short gerund phrase for the depleted message, e.g.
//                 "attaching and updating files" / "completing, reassigning,
//                 and deleting tasks". Falls back to "going" if omitted.
//   actionsNoun — short noun phrase for the running-low / paused messages,
//                 e.g. "file actions" / "task actions". Falls back to
//                 "actions".
//   onNavigate  — in-app PageLink-equivalent callback (the host owns the
//                 router — see ui-shared's OnboardingChecklist for the same
//                 pattern). Renders the in-app Billing CTA when provided;
//                 omit it to render the banner with no in-app button.
//   context     — the UI-extension serverless context (optional; only used
//                 for the portal link's return URL portal id).
export function BillingBanner({ state, actionLabel, actionsNoun, onNavigate, context }) {
  const banner = resolveBillingBanner(state?.entitlement, {
    actionLabel,
    actionsNoun,
  });
  if (!banner) return null;

  // "Update payment method" links out to the billing service's
  // GET /v1/billing/portal/start (resolves the customer + creates the Stripe
  // Customer Portal session server-side, 303s to Stripe in the opened tab) —
  // the same entry point BillingTab's "Manage subscription" uses. Built only
  // when the portal CTA is in play; null until billing_base_url + the signed
  // action token are both known, in which case the CTA falls back to the
  // in-app Billing tab (which renders the same portal link once loaded).
  let portalStartUrl = null;
  if (banner.cta?.kind === "portal") {
    const base = state?.billing_base_url ?? null;
    const portalToken = state?.billing_action_tokens?.portal ?? null;
    if (base && portalToken) {
      const returnUrl = state?.app_id
        ? `https://app.hubspot.com/app/${context?.portal?.id}/${state.app_id}/billing`
        : "https://app.hubspot.com/";
      portalStartUrl =
        `${base}/v1/billing/portal/start` +
        `?token=${encodeURIComponent(portalToken)}` +
        `&return_url=${encodeURIComponent(returnUrl)}`;
    }
  }

  return (
    <Alert title={banner.title} variant={banner.variant}>
      <Flex direction="column" gap="extra-small">
        <Text>{banner.message}</Text>
        {banner.cta?.kind === "portal" && portalStartUrl ? (
          <Button
            variant="secondary"
            href={{ url: portalStartUrl, external: true }}
          >
            {banner.cta.label}
          </Button>
        ) : banner.cta && onNavigate ? (
          <Button variant="secondary" onClick={() => onNavigate("/billing")}>
            {banner.cta.kind === "portal" ? "Go to Billing →" : banner.cta.label}
          </Button>
        ) : null}
      </Flex>
    </Alert>
  );
}

export default BillingBanner;
