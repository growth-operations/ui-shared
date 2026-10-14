import React from "react";
import { Flex, Tile, Text, LoadingSpinner } from "@hubspot/ui-extensions";
import { InstallProgress } from "./InstallProgress";
import { HealthHero } from "./HealthHero";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { SyncPulse } from "./SyncPulse";
import { FeatureUsage } from "./FeatureUsage";
import { PlanFitBanner } from "./PlanFitBanner";
import { PeriodComparison } from "./PeriodComparison";
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
// sync_pulse -> SyncPulse; pipeline -> PipelineTile. The credit meter is
// deliberately NOT on Home anymore (Andrew's 2026-10 feedback) — it lives at
// the top of the Usage tab; Home's credit story is the top BillingBanner's
// trial states plus the post-checklist period comparison. Renders nothing
// when no tile applies.
function ArchetypeTile({ state }) {
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
//   activated cockpit   -> <HealthHero> (+ "...on the right plan" when
//                            plan_fit says so)
//                          + <PlanFitBanner> (upgrade_recommended only)
//                          + <OnboardingChecklist> (only if not complete)
//                          + the archetype activity tile (sync/pipeline)
//                          + <PeriodComparison> (post-checklist, when the
//                            backend has a full closed period)
//                          + <FeatureUsage> (once the non-billing setup steps
//                            are done; needs the backend's state.feature_usage
//                            block)
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

  // FeatureUsage gate: render once every NON-BILLING onboarding step is done.
  // Every registry app marks its Choose-a-plan step paid-gated (key "plan",
  // routing to /billing, done only once the subscription is ACTIVE), so gating
  // on onboarding.complete would hide these sections from free/trial installs
  // forever — exactly the audience "Recommended to explore" is for. A fresh
  // install still has its install/workflow steps open, so setup comes first.
  // With no step model (older backends), fall back to the block-level flag.
  const isBillingStep = (s) => s?.key === "plan" || s?.cta_route === "/billing";
  const onboardingSteps = state.onboarding?.steps;
  const setupStepsComplete =
    Array.isArray(onboardingSteps) && onboardingSteps.length > 0
      ? onboardingSteps.every((s) => s.done === true || isBillingStep(s))
      : onboardingComplete;

  return (
    <Flex direction="column" gap="medium">
      {/* A completed-with-warnings activation still surfaces its warnings
          callout above the cockpit; InstallProgress renders null when clean. */}
      <InstallProgress state={state} onRetry={onRetry} />

      {/* No Home trial banner anymore — Andrew 2026-10-13: trial states (and
          every other app-stopping billing condition) fly in the ONE top
          <BillingBanner> the app layout mounts above every route. */}

      <HealthHero appName={appName} state={state} />

      {/* plan_fit upgrade_recommended — the savings banner. */}
      <PlanFitBanner state={state} />

      {state.onboarding && !onboardingComplete && (
        <OnboardingChecklist onboarding={state.onboarding} onNavigate={onNavigate} />
      )}

      <ArchetypeTile state={state} />

      {/* Post-checklist: the period-over-period comparison (null until the
          install has one full closed period). */}
      {onboardingComplete && <PeriodComparison state={state} />}

      {/* Most used / recommended-to-explore (state.feature_usage) — renders
          nothing on backends without the block or for legacy installs. Gated
          on the non-billing setup steps (NOT the paid-gated plan step) so a
          fresh install sees setup first but free/trial installs aren't
          locked out. */}
      {setupStepsComplete && <FeatureUsage state={state} onNavigate={onNavigate} />}

      <FeatureNudges nudges={state.nudges} onNavigate={onNavigate} />

      {helpfulLinksEl}
    </Flex>
  );
}

export default AppHome;
