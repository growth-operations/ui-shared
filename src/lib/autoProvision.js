// "Add Additional Credits Automatically" — the auto-provision toggle's copy
// (verbatim from Andrew's 2026-10 feedback, app name templated) plus the tiny
// state machine behind its ON→OFF confirmation flow. Framework-free so the
// flow is unit-testable; AutoProvisionToggle (../billing) stays thin.
//
// state.auto_provision = { enabled } is additive on the /v1/home payload and
// REPLACES the old billing-limit concept: enabled (the DEFAULT — also when
// the block is absent) buys another pack when monthly credits run out;
// disabled means no purchase and actions start failing the entitlement gate.

export const AUTO_PROVISION_TITLE = "Add Additional Credits Automatically";

export function autoProvisionSubtext(appName) {
  return `If monthly credits are used, this will automatically purchase another pack of credits so use of ${appName} is not impacted.`;
}

export function autoProvisionConfirmBody(appName) {
  return `Are you sure you want to disable automatic credit provisioning? If monthly credits are used, ${appName} will no longer function and workflow actions will fail.`;
}

export const AUTO_PROVISION_CONFIRM_YES = "Yes, disable this feature.";
export const AUTO_PROVISION_CONFIRM_NO =
  "No, keep automatic credit provisioning enabled.";

// Read the account flag with its contract default: enabled UNLESS the block
// explicitly says false.
export function resolveAutoProvision(autoProvision) {
  return { enabled: autoProvision?.enabled !== false };
}

// The toggle's interaction state. `enabled` itself lives in the component
// (seeded from the payload, updated on save); this machine owns everything
// around it: the ON→OFF confirmation and the in-flight POST.
//   idle       — nothing happening
//   confirming — the user flipped ON→OFF; the confirmation panel is up and
//                the toggle stays checked until they decide
//   saving     — a POST /v1/billing/auto-provision is in flight
export const AUTO_PROVISION_IDLE = {
  phase: "idle",
  notice: null, // null | { variant: "success"|"error", text }
};

// Events:
//   { type: "request", enabled }  — the user flipped the toggle to `enabled`.
//       OFF requests park in `confirming` (the dangerous direction); ON
//       requests save immediately (no confirmation to turn protection ON).
//   { type: "confirm" }           — "Yes, disable this feature."
//   { type: "cancel" }            — "No, keep automatic credit provisioning enabled."
//   { type: "saved" }             — the POST succeeded
//   { type: "failed", message }   — the POST failed
export function autoProvisionReducer(state, action) {
  switch (action.type) {
    case "request":
      if (state.phase === "saving") return state;
      return action.enabled === false
        ? { phase: "confirming", notice: null }
        : { phase: "saving", notice: null };
    case "confirm":
      if (state.phase !== "confirming") return state;
      return { phase: "saving", notice: null };
    case "cancel":
      if (state.phase !== "confirming") return state;
      return { phase: "idle", notice: null };
    case "saved":
      return {
        phase: "idle",
        notice: { variant: "success", text: "Saved." },
      };
    case "failed":
      return {
        phase: "idle",
        notice: {
          variant: "error",
          text: action.message ?? "Couldn't update automatic credit provisioning.",
        },
      };
    case "dismiss-notice":
      return { ...state, notice: null };
    default:
      return state;
  }
}
