import React from "react";
import { Flex, Heading, Alert, Text } from "@hubspot/ui-extensions";
import { humanizeStatus, statusVariant } from "../lib/format";

const HEALTH_VARIANT = { healthy: "success", attention: "warning", critical: "error" };
const HEALTH_TITLE = {
  healthy: "Everything looks healthy",
  attention: "Needs attention",
  critical: "Action required",
};

// The activated-state hero at the top of Home: a glanceable, color-coded health
// verdict (computed server-side in /v1/home, the `health` block). The
// install-time activation progress is handled separately by InstallProgress, so
// this focuses purely on steady-state health. When no health block is present it
// falls back to a color-coded verdict derived from the entitlement union
// (CONTRACT.md): trial_subscription -> the AppInstallStatus; credits -> a
// remaining/depleted verdict.
export function HealthHero({ appName, state }) {
  if (!state) return null;

  const health = state.health;
  const name = appName ?? state.app?.name;

  if (health?.level) {
    return (
      <Flex direction="column" gap="small">
        {name && <Heading>{name}</Heading>}
        <Alert
          title={HEALTH_TITLE[health.level] ?? "Status"}
          variant={HEALTH_VARIANT[health.level] ?? "info"}
        >
          <Flex direction="column" gap="extra-small">
            {(health.reasons ?? []).map((r, i) => (
              <Text key={i}>{r}</Text>
            ))}
          </Flex>
        </Alert>
      </Flex>
    );
  }

  // No health block — fall back to an entitlement-derived verdict.
  const ent = state.entitlement;
  if (!ent) {
    return name ? (
      <Flex direction="column" gap="small">
        <Heading>{name}</Heading>
      </Flex>
    ) : null;
  }

  if (ent.mode === "credits") {
    const remaining = ent.remaining ?? 0;
    const depleted = ent.depleted === true || remaining <= 0;
    const low = !depleted && remaining <= (ent.low_threshold ?? 0);
    const variant = depleted ? "error" : low ? "warning" : "success";
    const title = depleted
      ? "You're out of credits"
      : low
      ? "Running low on credits"
      : `${remaining} credits remaining`;
    return (
      <Flex direction="column" gap="small">
        {name && <Heading>{name}</Heading>}
        <Alert title={title} variant={variant}>
          {(depleted || low) && (
            <Text>
              {depleted
                ? "Pick a plan in Billing to keep going."
                : "You're getting close to your limit — consider a plan in Billing."}
            </Text>
          )}
        </Alert>
      </Flex>
    );
  }

  // trial_subscription (and any other status-bearing arm).
  return (
    <Flex direction="column" gap="small">
      {name && <Heading>{name}</Heading>}
      <Alert title={humanizeStatus(ent.status)} variant={statusVariant(ent.status)}>
        {ent.entitled === false && (
          <Text>
            This install isn't on an active plan. Open Billing to choose a plan
            and resume syncing.
          </Text>
        )}
      </Alert>
    </Flex>
  );
}

export default HealthHero;
