import React from "react";
import { Flex, Tile, Text, ProgressBar, Link, Button } from "@hubspot/ui-extensions";

// Lifecycle Mode A: the setup checklist for new/not-yet-activated installs.
// Each step's `done` is computed server-side (/v1/home onboarding block) from
// the account doc, so the list self-checks. A single "next best action" button
// points at the first incomplete step. Steps carry either a cta_route (an
// in-app PageLink target) or a cta_url (external/deep link).
//
// `onNavigate(route)` is supplied by the host app (PageLink can't be created
// here without the router); cta_url renders as an external Link.
export function OnboardingChecklist({ onboarding, onNavigate }) {
  if (!onboarding || !Array.isArray(onboarding.steps) || onboarding.steps.length === 0) {
    return null;
  }

  const steps = onboarding.steps;
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const next = steps.find((s) => !s.done);

  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: "bold", fontSize: "lg" }}>
          Get started ({doneCount} of {total})
        </Text>
        <ProgressBar value={doneCount} maxValue={total} showPercentage={true} />

        <Flex direction="column" gap="extra-small">
          {steps.map((s) => (
            <Text key={s.key} format={{ fontWeight: s.done ? "regular" : "demibold" }}>
              {s.done ? "✓" : "○"} {s.label}
            </Text>
          ))}
        </Flex>

        {next && (
          <Flex direction="row" gap="small" align="center">
            {next.cta_url ? (
              <Link href={{ url: next.cta_url, external: true }} variant="primary">
                {next.cta_label ?? `Next: ${next.label}`} →
              </Link>
            ) : next.cta_route && onNavigate ? (
              <Button variant="primary" onClick={() => onNavigate(next.cta_route)}>
                {next.cta_label ?? `Next: ${next.label}`}
              </Button>
            ) : (
              <Text format={{ fontWeight: "demibold" }}>Next: {next.label}</Text>
            )}
          </Flex>
        )}
      </Flex>
    </Tile>
  );
}

export default OnboardingChecklist;
