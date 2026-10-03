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
    "plan": null,                     // plan name once on a paid monthly allowance

    // --- Top-up ("bank") billing model (topup-model accounts only) ---
    // granted/used/remaining become a COMBINED pool+bank display: granted =
    // period pool + bank remaining, used = granted - remaining (so after a
    // period reset with bank left the meter reads e.g. "0 of 1,700").
    // Metered-model accounts keep the raw semantics (used grows past granted
    // as overage) and only ever see threshold_state "healthy"/"depleted".
    "top_up_bank_remaining": 0,       // never-expiring prepaid credits left
    "last_top_up_at": null,           // ISO datetime of the last top-up grant
    // "healthy" | "top_up_pending" | "top_up_failed" | "limit_reached" |
    // "depleted". "depleted" is the ONLY hard-blocked state; over_included
    // (metered paid overage) always means "paying overage, not blocked".
    "threshold_state": "healthy",
    // "metered" | "topup" — the billing model in force. Drives which Billing
    // tab sections render (top-up history + billing limit show only for
    // "topup"). Absent on backends that predate the top-up contract.
    "billing_model": "metered",
    // The per-period auto top-up spend cap, in cents (null/absent = uncapped).
    // Populated for ALL accounts; drives the Billing tab's limit control.
    "billing_limit_cents": null
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

## Subscription-canceled gate

For installs whose subscription is CANCELED (or uninstalled), every interactive
surface hard-blocks with a "No active subscription" screen + Go-to-Billing link.
Two pieces, both implemented in `common.entitlements.fastapi`:

**Mount-time check** — `GET {base}/v1/entitlement?portalId={id}` (verify_hubspot),
always 200:

```jsonc
{
  "entitled": false,                 // false ONLY for canceled/uninstalled/missing install
  "status": "canceled",              // AppInstallStatus | null
  "billing_url": "https://app.hubspot.com/app/{portal_id}/{app_id}/billing"
}
```

**Per-endpoint enforcement** — gated routes raise `SubscriptionCanceled` →
`402 {"detail": str, "code": "subscription_canceled", "billing_url": str}`.

Clients: cards wrap their tree in `<SubscriptionGate>` (src/billing/SubscriptionGate.jsx);
browser extensions key off the 402 `code`. The gate is deliberately NARROWER than
`entitlement.entitled` — past_due / pending_purchase / paused keep the banner UX and
are NOT 402'd. Both layers fail open on infrastructure errors (a Firestore/network
blip must not hard-down paying customers).

## Top-up billing endpoints (base service)

For credit apps on the top-up ("bank") model, the base service exposes two
app-pages billing routes (verify_hubspot — the platform injects
Authorization; `portalId` rides as a query param like the other base-hosted
app_pages routes). ui-shared's `getTopUps` / `setBillingLimit`
(src/sdk/app/topUps.js) call them via `callAppApi`:

- `GET /v1/hubspot/app_pages/{app}/billing/top-ups` →
  `{ "top_ups": [{ "at", "credits", "price_cents", "period_key" }] }`
  (newest first). Drives BillingTab's "Top-up history" section.
- `POST /v1/hubspot/app_pages/{app}/billing/limit` with
  `{ "limit_cents": int | null }` — set/clear the per-period auto top-up
  spend cap. Drives BillingTab's "Billing limit" control. This route has a
  SECOND auth dep beyond verify_hubspot: a required `token` query param
  carrying a billing action token (common.billing.action_token; any action in
  the portal/checkout/upgrade/restart vocabulary verifies) — the same proof
  of recent in-app billing-surface access the /v1/billing/*/start endpoints
  require. ui-shared passes the (interval-refreshed)
  `billing_action_tokens.portal`.
