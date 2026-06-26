# /v1/home contract (the keystone)

The single payload every Growth Operations app returns from `GET /api/v1/home?portalId={id}`
(verify_hubspot). The shared `@growth-operations/ui-shared` components render it. One
contract serves all archetypes; components branch on `entitlement.mode`.

```jsonc
{
  "app": {
    "name": "Sparkfly Sync",         // display name
    "app_key": "hubspot_sparkfly",
    "archetype": "big_app"           // big_app | ats | credit  (informational)
  },

  // ENTITLEMENT — discriminated union on `mode`. The ONE field every consumer gates on.
  // Arm A — trial_subscription (big_app + ATS). Maps onto existing common.entitlements.is_entitled.
  "entitlement": {
    "mode": "trial_subscription",
    "entitled": true,                 // is_entitled(account)
    "status": "trialing",             // AppInstallStatus
    "trial_ends_at": "2026-07-01T...",// = current_period_end while TRIALING (else null)
    "current_period_end": "2026-07-01T...",
    "cancel_at_period_end": false,
    "is_sandbox": false,
    "sandbox_trial_expires_at": null
  },
  // Arm B — credits (credit apps). NET-NEW backend; UI built now.
  "entitlement": {
    "mode": "credits",
    "entitled": true,                 // remaining > 0
    "granted": 100,                   // current allowance (free grant = 100) 
    "used": 37,
    "remaining": 63,
    "grant_expires_at": "2026-07-18T...", // 100 free credits / 30 days; null for paid allowance
    "low_threshold": 10,              // drives "running low" nudge
    "depleted": false,
    "plan": null                      // plan name once on a paid monthly allowance
  },

  // INSTALL/ACTIVATION PROGRESS — common (today in /v1/state). Drives InstallProgress.
  "activation": {
    "status": "completed",            // ActivationStatus: pending|running|completed|failed
    "step": 5, "total": 5,
    "label": null,                    // current step label while running
    "complete": true,
    "warnings": []                    // activation_warnings
  },

  // HEALTH HERO — common, server-computed verdict. Drives HealthHero (activated state).
  "health": { "level": "healthy", "reasons": [] },  // healthy | attention | critical

  // ONBOARDING — common shape, archetype-specific steps. Drives OnboardingChecklist.
  "onboarding": {
    "complete": false,
    "steps": [
      { "key": "connect", "label": "Connect your Sparkfly account",
        "done": false, "cta_url": "https://app.hubspot.com/integrations-settings/...",
        "cta_label": "Connect" }
      // cta_route (in-app PageLink target) OR cta_url (external/deep link)
    ]
  },

  // NUDGES — common shape. Drives FeatureNudges. Credit apps put "running low → pick a plan" here.
  "nudges": [
    { "key": "bidirectional", "title": "Sync HubSpot segments back to Sparkfly",
      "message": "You're syncing one-way. Turn on bidirectional sync.",
      "cta_route": "/contact-sync", "cta_label": "Enable" }
  ],

  // ARCHETYPE ACTIVITY TILE — at most ONE present.
  "sync_pulse":   { "last_sync_at": "...", "records_synced": 1240, "records_failed": 2, "label": "Contact sync" }, // big_app
  "credit_meter": { "granted": 100, "used": 37, "remaining": 63, "recent": [ { "at": "...", "amount": 3, "action": "Parsed 3 line items on Deal Acme" } ] }, // credit — `recent` from the credit ledger (common.entitlements.CreditService.recent_usage → build_credit_meter); each entry projects a metered debit (action label + amount + time), so customers see itemized usage in-app.
  "pipeline":     { "open_jobs": 4, "applications_by_stage": { "applied": 12, "interview": 3 }, "outstanding_scorecards": 5 }, // ats

  // PLANS — credit apps only. The pickable upgrade path for the Billing tab,
  // built from the Stripe catalog mirror (common.billing.catalog.get_plans).
  // Drives the shared <PlanGrid>. Tiers sorted by tier_order; each carries its
  // monthly and/or annual Stripe price_id for checkout. `current` marks the
  // tier the account is on (free grant => no current paid tier). Absent for
  // non-credit apps. talk_to_sales tiers (enterprise) hide price + checkout and
  // show a contact CTA instead.
  "plans": [
    { "tier": "free", "name": "Free", "tier_order": 0, "credits_per_period": 100,
      "features": ["100 credits/mo", "Community support"], "talk_to_sales": false,
      "current": true, "monthly": null, "annual": null },
    { "tier": "starter", "name": "Starter", "tier_order": 1, "credits_per_period": 1000,
      "features": ["1,000 credits/mo", "Email support"], "talk_to_sales": false,
      "current": false,
      "monthly": { "price_id": "price_123", "unit_amount": 2900, "currency": "usd" },
      "annual":  { "price_id": "price_456", "unit_amount": 29000, "currency": "usd" } },
    { "tier": "enterprise", "name": "Enterprise", "tier_order": 3, "credits_per_period": null,
      "features": ["Custom volume", "SSO", "Dedicated support"], "talk_to_sales": true,
      "current": false, "monthly": null, "annual": null }
  ],

  // Deep-link plumbing — common.
  "billing_base_url": "https://billing.growth-operations.com",
  "app_id": "31489633",

  // USER — injected by the backend using the HubSpot userId query param (auto-sent
  // by hubspot.fetch on every call). Gates admin-only UI like the Billing tab.
  "user": {
    "is_super_admin": true
  }
}
```

## Navigation
In-app CTAs (onboarding steps, nudges) carry `cta_route` (an app-page path like
`/billing`). The host app passes `onNavigate(route)` to `<AppHome>` wired to the
pages SDK action **`actions.navigateToPage({ to: route })`** — this DOES exist
in @hubspot/ui-extensions (it's in the pages `actions` object, present since
0.13.x; not in the `usePageRoute` hooks file, which is why it's easy to miss).
Use `cta_url` (external/full deep link) only for genuinely external targets
(e.g. the settings extension deep link), which render as an external `Link`.

## Rules
- `entitlement.entitled` is the ONLY gate the UI/feature checks read. Backend computes it
  (trial: is_entitled status; credits: remaining > 0).
- Components are presentational: all app-specific content (onboarding steps, nudges, health
  reasons) is computed server-side. The package never hardcodes app logic.
- Optional blocks (health, sync_pulse, credit_meter, pipeline, onboarding, nudges) may be
  absent; components render nothing when their block is missing.
- Backend engine lives in `common` (operates on the Account doc + per-app config/rules);
  each app exposes `GET /api/v1/home` that calls it. trial_subscription mode maps onto the
  existing Account billing block + is_entitled. credits mode is net-new (balance model, grant,
  decrement, credit-aware is_entitled) — built when each app flips to the credit model.
