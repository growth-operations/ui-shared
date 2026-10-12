import React from "react";
import { Flex, Text, Alert } from "@hubspot/ui-extensions";
import { resolveTrialBanner } from "../lib/homeBlocks";

// The Home trial banner for credit apps — Andrew's 2026-10 copy, in all three
// states (active countdown / ended-with-credits-left / out of credits), with
// the "Need help?" footer line. State selection + copy live in
// ../lib/homeBlocks (unit-tested); this is pure rendering.
//
// Renders nothing for paid plans, non-credits modes, pre-install, or a
// backend that carries no grant clock (resolveTrialBanner returns null).
//
// Props:
//   state   — the /v1/home payload (reads entitlement + app.name).
//   appName — display name override; defaults to state.app.name.
export function TrialBanner({ state, appName }) {
  const banner = resolveTrialBanner(state?.entitlement, {
    appName: appName ?? state?.app?.name,
  });
  if (!banner) return null;

  return (
    <Alert title={banner.title} variant={banner.variant}>
      <Flex direction="column" gap="extra-small">
        <Text>{banner.body}</Text>
        <Text variant="microcopy">{banner.footer}</Text>
      </Flex>
    </Alert>
  );
}

export default TrialBanner;
