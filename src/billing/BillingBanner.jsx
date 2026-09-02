import React from "react";
import { Flex, Text, Alert, Button } from "@hubspot/ui-extensions";

// Shared app-wide billing banner for the credit archetype (CreditState.
// to_entitlement's credits arm). Meant to sit in the app's layout/shell
// (rendered above every route), NOT inside the Billing tab itself — it's the
// "surface this everywhere, not just on the Billing page" nudge.
//
// A paid plan is never blocked or "running low" the way the free tier is —
// exceeding the included bucket is overage, not an emergency (see
// common.entitlements.credits.to_entitlement's `over_included` field). Only
// the free tier gets the blocking/urgent banners; a paid account in overage
// gets a calm informational one instead.
//
// Originally copy-pasted per app (a local `billingBannerFor` in each
// Pages.jsx) — moved here after the SAME bug (independently re-deriving
// urgency from raw `remaining`, no plan-awareness) had to be hand-fixed in
// 3 places (confirmed live 2026-09-02, file-attachment-manager: a paid
// account correctly kept working while this banner still showed the
// blocking "out of credits" copy). Consume this instead of re-implementing
// it — the next app in the wave should need zero new banner code.
//
// Props:
//   state       — the /v1/home payload (entitlement union). Renders nothing
//                 outside the credits archetype or before install completes.
//   actionLabel — short gerund phrase for the depleted message, e.g.
//                 "attaching and updating files" / "completing, reassigning,
//                 and deleting tasks". Falls back to "going" if omitted.
//   actionsNoun — short noun phrase for the running-low message, e.g.
//                 "file actions" / "task actions". Falls back to "actions".
//   onNavigate  — in-app PageLink-equivalent callback (the host owns the
//                 router — see ui-shared's OnboardingChecklist for the same
//                 pattern). Renders a "Go to Billing" button when provided;
//                 omit it to render the banner with no button.
export function BillingBanner({ state, actionLabel, actionsNoun, onNavigate }) {
  const ent = state?.entitlement;
  if (!ent || ent.mode !== "credits" || ent.status === "not_installed") {
    return null;
  }

  const onPaidPlan = !!ent.plan;
  let banner = null;

  if (!onPaidPlan && (ent.depleted === true || ent.entitled === false)) {
    banner = {
      variant: "error",
      title: "You're out of credits",
      message: `Your credits are used up. Choose a plan in Billing to keep ${actionLabel ?? "going"}.`,
    };
  } else if (onPaidPlan && ent.over_included === true) {
    banner = {
      variant: "warning",
      title: "You've used your included credits",
      message:
        "Extra usage this period is billed as overage at your plan's per-credit rate.",
    };
  } else if (
    !onPaidPlan &&
    typeof ent.remaining === "number" &&
    typeof ent.low_threshold === "number" &&
    ent.remaining <= ent.low_threshold
  ) {
    banner = {
      variant: "warning",
      title: "Running low on credits",
      message: `You're almost out of credits. Pick a plan in Billing so your ${
        actionsNoun ?? "actions"
      } don't get interrupted.`,
    };
  }

  if (!banner) return null;

  return (
    <Alert title={banner.title} variant={banner.variant}>
      <Flex direction="column" gap="extra-small">
        <Text>{banner.message}</Text>
        {onNavigate && (
          <Button variant="secondary" onClick={() => onNavigate("/billing")}>
            Go to Billing →
          </Button>
        )}
      </Flex>
    </Alert>
  );
}

export default BillingBanner;
