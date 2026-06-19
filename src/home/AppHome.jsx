import React from "react";
import { Flex, Tile, Text, LoadingSpinner } from "@hubspot/ui-extensions";
import { InstallProgress } from "./InstallProgress";
import { HealthHero } from "./HealthHero";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { SyncPulse } from "./SyncPulse";
import { CreditMeter } from "./CreditMeter";
import { FeatureNudges } from "./FeatureNudges";
import { HelpfulLinks } from "./HelpfulLinks";

// Minimal inline ATS tile (the `pipeline` block). Kept tiny here rather than a
// separate file — it's the simplest of the three archetype tiles. Renders
// nothing when there's no pipeline block.
function PipelineTile({ pipeline }) {
  if (!pipeline) return null;
  const byStage = pipeline.applications_by_stage ?? {};
  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: "bold" }}>Pipeline</Text>
        <Flex direction="row" gap="large">
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: "demibold" }}>Open jobs</Text>
            <Text>{pipeline.open_jobs ?? 0}</Text>
          </Flex>
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: "demibold" }}>Outstanding scorecards</Text>
            <Text>{pipeline.outstanding_scorecards ?? 0}</Text>
          </Flex>
        </Flex>
        {Object.keys(byStage).length > 0 && (
          <Flex direction="row" gap="medium">
            {Object.entries(byStage).map(([stage, count]) => (
              <Flex key={stage} direction="column" gap="extra-small">
                <Text format={{ fontWeight: "demibold" }}>{stage}</Text>
                <Text>{count}</Text>
              </Flex>
            ))}
          </Flex>
        )}
      </Flex>
    </Tile>
  );
}

// Picks the single archetype activity tile (CONTRACT: at most ONE present).
// credit_meter / credits mode -> CreditMeter; sync_pulse -> SyncPulse;
// pipeline -> PipelineTile. Renders nothing when none apply.
function ArchetypeTile({ state }) {
  if (state.credit_meter || state.entitlement?.mode === "credits") {
    return (
      <CreditMeter
        entitlement={state.entitlement}
        creditMeter={state.credit_meter}
      />
    );
  }
  if (state.sync_pulse) return <SyncPulse syncPulse={state.sync_pulse} />;
  if (state.pipeline) return <PipelineTile pipeline={state.pipeline} />;
  return null;
}

// The opinionated one-line Home integration. An app's Pages.jsx Home route can
// render just <AppHome state={homePayload} onNavigate={fn} appName={...} />.
//
// Lifecycle composition:
//   no state            -> LoadingSpinner (still fetching /v1/home)
//   activation pending  -> <InstallProgress> (install isn't finished yet)
//   activated cockpit   -> <HealthHero>
//                          + <OnboardingChecklist> (only if not complete)
//                          + the archetype activity tile (sync/credit/pipeline)
//                          + <FeatureNudges>
//
// Props:
//   state      — the /v1/home payload (null while loading).
//   onNavigate — (route) => void, threaded to onboarding + nudges for in-app
//                PageLink navigation (the host owns the router).
//   appName    — display name override; defaults to state.app.name.
//   onRetry    — optional, passed to InstallProgress for the failed state.
//   helpfulLinks — optional props for the standard HelpfulLinks section
//                  (e.g. { portalId, appId, appName, docsUrl, supportUrl,
//                  links }). Omit to hide the section. The host passes this
//                  (it owns context.portal.id + the app's docs/support); it can
//                  also come from a state.helpful_links block if the backend
//                  builds one.
export function AppHome({ state, onNavigate, appName, onRetry, helpfulLinks }) {
  if (!state) {
    return <LoadingSpinner showLabel label="Loading…" />;
  }

  const activation = state.activation;
  const activationComplete =
    !activation || activation.complete === true || activation.status === "completed";

  // HelpfulLinks props: explicit prop wins, else a state.helpful_links block if
  // the backend builds one. Shown in both the install and cockpit views so help
  // is reachable even mid-setup.
  const links = helpfulLinks ?? state.helpful_links ?? null;
  const helpfulLinksEl = links ? <HelpfulLinks {...links} /> : null;

  // Install isn't finished (running / failed / completed-with-warnings) — show
  // the install experience instead of the cockpit.
  if (!activationComplete) {
    return (
      <Flex direction="column" gap="medium">
        <InstallProgress state={state} onRetry={onRetry} />
        {helpfulLinksEl}
      </Flex>
    );
  }

  const onboardingComplete = state.onboarding?.complete === true;

  return (
    <Flex direction="column" gap="medium">
      {/* A completed-with-warnings activation still surfaces its warnings
          callout above the cockpit; InstallProgress renders null when clean. */}
      <InstallProgress state={state} onRetry={onRetry} />

      <HealthHero appName={appName} state={state} />

      {state.onboarding && !onboardingComplete && (
        <OnboardingChecklist onboarding={state.onboarding} onNavigate={onNavigate} />
      )}

      <ArchetypeTile state={state} />

      <FeatureNudges nudges={state.nudges} onNavigate={onNavigate} />

      {helpfulLinksEl}
    </Flex>
  );
}

export default AppHome;
