import React, { useRef } from "react";
import {
  Flex,
  Tile,
  Text,
  ProgressBar,
  Alert,
  Button,
  LoadingSpinner,
} from "@hubspot/ui-extensions";

// THE standard install-status module — every Growth Operations app uses this
// for the post-install activation experience. Baselined on the Anvil
// Installation page (client_code/Pages/Installation) which handled: a step
// progress bar, a success/final-output state, a non-fatal WARNINGS panel, and a
// FAILED + retry panel. We carry all of those into the new (Stripe/Firestore)
// world, driven by the /v1/home `activation` block (CONTRACT.md).
//
// State machine (from activation.status + activation.step):
//   RUNNING / PENDING  -> determinate progress bar (step / total) + label
//   FAILED             -> error alert + Retry button (onRetry)
//   COMPLETED w/ warnings -> success + a warnings callout
//   COMPLETED clean    -> render nothing (install is done; Home shows health)
//
// Props:
//   state    — the /v1/home payload. Reads the nested `activation` block:
//              activation.status, activation.step, activation.total,
//              activation.label, activation.complete, activation.warnings.
//   onRetry  — optional () => void to re-trigger activation (re-publishes the
//              activation Pub/Sub message via an app endpoint). If omitted, the
//              FAILED state still renders guidance, just no button.
export function InstallProgress({ state, onRetry }) {
  // Clamp the displayed step to be MONOTONIC. A reinstall (re-consent for new
  // scopes) re-runs activation, which resets activation_step to 0 server-side;
  // the poll can catch that reset and the bar would visibly jump backwards
  // (e.g. 37% -> 0% -> 53%). Track the high-water mark per mount so progress
  // only ever moves forward.
  const maxStepSeen = useRef(0);

  const activation = state?.activation;
  // No activation block => nothing to show (Home's health hero takes over).
  if (!activation) return null;

  const status = activation.status;
  const rawStep = activation.step ?? 0;
  const total = activation.total ?? 5;
  maxStepSeen.current = Math.max(maxStepSeen.current, rawStep);
  const step = maxStepSeen.current;
  const warnings = activation.warnings ?? [];
  const complete = activation.complete === true || status === "completed";

  // FAILED — surface the error and let the user retry (Pub/Sub also retries
  // server-side, but an explicit retry beats a silent stall).
  if (status === "failed") {
    return (
      <Alert title="Setup didn't finish" variant="error">
        <Flex direction="column" gap="small">
          <Text>
            We hit a problem finishing your install. This often clears itself on
            the next automatic retry; if it persists, retry now or contact
            support.
          </Text>
          {warnings.length > 0 &&
            warnings.map((w, i) => <Text key={i}>• {w}</Text>)}
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Retry setup
            </Button>
          )}
        </Flex>
      </Alert>
    );
  }

  // RUNNING / PENDING — determinate progress while activation provisions assets.
  if (!complete) {
    return (
      <Tile>
        <Flex direction="column" gap="small">
          <Text format={{ fontWeight: "bold" }}>Setting up your install…</Text>
          <ProgressBar
            title={activation.label ?? "Finishing up…"}
            value={step}
            maxValue={total}
            showPercentage={true}
          />
          <LoadingSpinner label="This usually takes under a minute." showLabel />
        </Flex>
      </Tile>
    );
  }

  // COMPLETED with non-fatal warnings — let the user know setup finished but
  // something needs a look (mirrors the Anvil warnings panel).
  if (complete && warnings.length > 0) {
    return (
      <Alert title="Setup finished with warnings" variant="warning">
        <Flex direction="column" gap="extra-small">
          {warnings.map((w, i) => (
            <Text key={i}>• {w}</Text>
          ))}
        </Flex>
      </Alert>
    );
  }

  // COMPLETED clean — nothing to show; Home's health hero takes over.
  return null;
}

export default InstallProgress;
