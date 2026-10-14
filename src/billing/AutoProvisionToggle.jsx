import React, { useEffect, useReducer, useState } from "react";
import { Alert, Box, Button, Flex, Heading, Text, Toggle } from "@hubspot/ui-extensions";
import {
  AUTO_PROVISION_CONFIRM_NO,
  AUTO_PROVISION_CONFIRM_YES,
  AUTO_PROVISION_IDLE,
  AUTO_PROVISION_TITLE,
  autoProvisionConfirmBody,
  autoProvisionReducer,
  autoProvisionSubtext,
} from "../lib/autoProvision";
import { setAutoProvision } from "../sdk/app/topUps";

// "Add Additional Credits Automatically" — the auto-provision toggle on the
// Billing tab (REPLACES the old billing-limit control). ON (the default) buys
// another pack of additional credits when monthly credits run out; OFF means
// no purchase and workflow actions start failing the entitlement gate.
//
// The ON→OFF direction is dangerous, so it parks in an inline confirmation
// panel (Andrew's exact copy + buttons) instead of saving on click; OFF→ON
// saves immediately — no confirmation to turn protection back ON. The flow
// itself is a unit-tested reducer (../lib/autoProvision); this component is
// the wiring: controlled Toggle + the POST to the base service's
// /v1/hubspot/app_pages/{app}/billing/auto-provision (see setAutoProvision).
//
// Props:
//   context            — the UI-extension serverless context
//                        (context.portal.id).
//   appKey             — the billing app_key for THIS app.
//   enabled            — the resolved flag (resolveAutoProvision; true when
//                        the state.auto_provision block is absent).
//   appName            — display name templated into the copy.
//   billingActionToken — the (interval-refreshed)
//                        state.billing_action_tokens.portal. Without it the
//                        toggle stays read-only — the same "hidden/disabled
//                        until token exists" posture as the other billing
//                        controls.
export function AutoProvisionToggle({
  context,
  appKey,
  enabled: enabledProp,
  appName = "this app",
  billingActionToken = null,
}) {
  const [enabled, setEnabled] = useState(enabledProp !== false);
  const [ui, dispatch] = useReducer(autoProvisionReducer, AUTO_PROVISION_IDLE);

  // The flag arrives with /v1/home; adopt a changed server-side value (the
  // payload refetches after install/refresh).
  useEffect(() => {
    setEnabled(enabledProp !== false);
  }, [enabledProp]);

  const ready = !!billingActionToken;
  const busy = ui.phase === "saving";

  const save = async (next) => {
    try {
      await setAutoProvision(context, {
        appKey,
        portalId: context?.portal?.id,
        token: billingActionToken,
        enabled: next,
      });
      setEnabled(next);
      dispatch({ type: "saved" });
    } catch (e) {
      dispatch({
        type: "failed",
        message: e?.message ?? "Couldn't update automatic credit provisioning.",
      });
    }
  };

  const onToggle = (checked) => {
    if (!ready || busy) return;
    dispatch({ type: "request", enabled: checked });
    if (checked) save(true); // turning protection back ON needs no confirmation
  };

  return (
    <Flex direction="column" gap="small">
      <Heading>{AUTO_PROVISION_TITLE}</Heading>
      <Text>{autoProvisionSubtext(appName)}</Text>
      <Toggle
        label={AUTO_PROVISION_TITLE}
        labelDisplay="hidden"
        name="auto-provision"
        checked={enabled}
        readOnly={!ready || busy}
        onChange={onToggle}
      />
      {!ready && (
        <Text variant="microcopy">
          Preparing billing… this control unlocks in a moment. Refresh the page
          if this persists.
        </Text>
      )}

      {/* The ON→OFF confirmation (the toggle stays checked while this is up;
          cancel snaps back to idle with the flag untouched). */}
      {ui.phase === "confirming" && (
        <Alert variant="warning" title="Disable automatic credit provisioning?">
          <Box flex="auto">
            <Flex direction="column" gap="small">
              <Text>{autoProvisionConfirmBody(appName)}</Text>
              <Flex direction="row" gap="small">
                <Button
                  variant="destructive"
                  onClick={() => {
                    dispatch({ type: "confirm" });
                    save(false);
                  }}
                >
                  {AUTO_PROVISION_CONFIRM_YES}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => dispatch({ type: "cancel" })}
                >
                  {AUTO_PROVISION_CONFIRM_NO}
                </Button>
              </Flex>
            </Flex>
          </Box>
        </Alert>
      )}

      {ui.notice && (
        <Alert
          variant={ui.notice.variant}
          title={ui.notice.variant === "success" ? "Saved" : "Couldn't save"}
        >
          <Box flex="auto">
            <Text>{ui.notice.text}</Text>
          </Box>
        </Alert>
      )}
    </Flex>
  );
}

export default AutoProvisionToggle;
