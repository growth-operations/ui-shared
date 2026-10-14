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
    // tab sections render (pack purchase history + auto-provision show only
    // for "topup"). Absent on backends that predate the top-up contract.
    "billing_model": "metered"
    // billing_limit_cents was REMOVED (App Home/Billing refresh): the
    // per-period spend cap is superseded by state.auto_provision below.
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

  // STATE (App Home/Billing refresh; credit apps served by growth-ops-apps-base).
  // ADDITIVE: absent on older backends — degrade gracefully (render the
  // pre-refresh UI) when "state" is missing. health v2 is mirrored into the
  // top-level "health" block too, so HealthHero gets "attention" either way.
  // DUALITY: ui-shared dual-reads the state.* blocks (nested under "state"
  // wins; top-level fallback) — a SELF-HOSTED backend (ATS) MAY emit
  // credits/period_comparison/plan_fit/feature_usage TOP-LEVEL instead of
  // nesting. Never read only one location (a top-level-only read shipped
  // dead on base-hosted apps 2026-10-12; fixed 2026-10-13).
  "state": {
    "credits": {
      "monthly":    { "remaining": 900, "included": 1000,
                      "renews_on": "2026-10-12" },  // subscription current_period_end (YYYY-MM-DD), null when unknown
      "additional": { "remaining": 1500, "purchased": 2000,
                      "expires": false }            // additional credits (formerly "top-up bank") never expire
    },
    // Replaces the old billing-limit concept. enabled = buy another pack
    // automatically when monthly credits run out; disabled = no purchase,
    // actions fail the entitlement gate at zero. Default true. A legacy
    // disabled/zero billing limit maps to enabled=false on first read. A
    // legacy POSITIVE billing_limit_cents was a spend CEILING, not an opt-out
    // — it maps to enabled=true (UNCAPPED auto-buy; the cap concept is gone).
    // ⚠ PENDING EXPLICIT SIGN-OFF: that positive-limit -> enabled=true mapping
    // turns a capped spend into an uncapped one for those installs.
    "auto_provision": { "enabled": true },
    // Last CLOSED billing period vs current period-to-date, off the credit
    // ledger. null until the install has one full closed period.
    "period_comparison": {
      "last_period":    { "label": "Sep 12 – Oct 11", "total_credits": 410,
                          "by_action": [{ "action": "geo.lookup", "credits": 410 }] },
      "current_period": { "label": "Oct 12 – present", "total_credits": 96,
                          "by_action": [{ "action": "geo.lookup", "credits": 96 }] },
      // PERIODS CHART (1.27.0; ADDITIVE — older backends omit it and get the
      // legacy two-column layout): 2-3 billing-period windows OLDEST → NEWEST
      // (a third bar appears once a second full period has closed; annual
      // plans produce annual bars), with FRIENDLY slice names server-side.
      // by_action entries carry {action, name, credits} — render "name";
      // slices are capped server-side (top 7 by cross-period credits, rest
      // folded into a per-period "Other" slice); total_credits is uncapped.
      // A zero-usage period emits by_action: [] — zero-fill one 0-credit row
      // so the bar renders empty instead of dropping the category. ui-shared
      // renders ONE stacked BarChart (x = period category, y = credits,
      // groupFieldByColor = feature, stacking) + a per-period totals caption.
      "periods": [
        { "label": "Aug 13 – Sep 11", "total_credits": 380,
          "by_action": [{ "action": "geo.lookup", "name": "Geocode Records", "credits": 370 },
                        { "action": "other", "name": "Other", "credits": 10 }] },
        { "label": "Sep 12 – Oct 11", "total_credits": 410,
          "by_action": [{ "action": "geo.lookup", "name": "Geocode Records", "credits": 410 }] },
        { "label": "Oct 12 – present", "total_credits": 96,
          "by_action": [{ "action": "geo.lookup", "name": "Geocode Records", "credits": 96 }] }
      ]
    },
    // Computed AT READ TIME (no cron). upgrade_recommended when the install
    // bought >= 3 additional-credit packs this period OR last period's total
    // consumption would have been cheaper on the next tier (by tier_order);
    // monthly_savings_usd comes from the catalog's monthly price legs and is
    // null when not computable (e.g. a talk-to-sales target tier).
    "plan_fit": {
      "verdict": "right_plan",        // right_plan | upgrade_recommended
      "target_tier": null,            // e.g. "professional"
      "monthly_savings_usd": null,
      "topup_packs_this_period": 0
    },
    // FEATURE USAGE — base feat/home-feature-usage, extended 2026-10-13 to
    // non-credit signals. Aggregates DEBIT credits off the credit ledger
    // (all-time, newest-first, bounded) AND/OR feature_usage event rows from
    // BigQuery (growth_ops_usage.events), through the app's static feature
    // registry (centralized in common.home.feature_registry). Drives the
    // shared <FeatureUsage> Home sections ("Most used features" +
    // "Recommended to explore").
    //   most_used  — top 5 features by credits/events; {key, name,
    //                credits_or_events, unit}. unit is LIVE ("credits" |
    //                "events"): ledger-backed features report credits,
    //                event-backed features (e.g. geocoding nearby lists, ATS
    //                scorecards) report events; absent => "credits".
    //   not_in_use — every DETECTABLE registry feature with zero observed
    //                usage (features with no signal source are never claimed
    //                "not in use"; event-backed features are also spared when
    //                the events read fails); {key, name, docs_url, rationale}
    //                — docs_url/rationale may be null/"".
    //                RECOMMENDATION BUCKETS (1.27.0): a row MAY be a BUCKET
    //                standing in for a set of related features (e.g. ATS's
    //                "chrome_extension" row replaces four extension-flavored
    //                feature rows). Same wire shape — key/name/docs_url/
    //                rationale/ctas — so NO renderer change: bucket keys share
    //                the not_in_use key namespace (the registry validator
    //                rejects collisions). Emitted only when no member feature
    //                shows usage; hidden once any member is used.
    // DEGRADATION: the block is ABSENT on older backends, legacy installs,
    // and apps with no feature registry — ui-shared renders NOTHING (never an
    // empty box). A fresh install gets most_used: [] and the full detectable
    // catalog in not_in_use.
    // RENDERING CAP (1.23.0): RecommendedTile renders not_in_use whole when
    // <= 4 entries; longer lists show a deterministic 3-per-day rotating
    // window seeded by the UTC date alone (pickDailyRecommendations — no
    // per-portal state, no backend involvement) + a "new picks daily"
    // microcopy.
    // SETUP CTAS (1.24.0; LIST shape 1.26.0): not_in_use entries MAY carry
    // "ctas": [{ "label", "url"|"route" }, ...] — the "go do the thing"
    // actions for an unused feature (deep link into the HubSpot layout editor
    // to add the feature's card, a store listing, or an in-app route). A LIST
    // because one feature can surface in multiple places (e.g. a card on both
    // contacts and applications). For card-backed features "never used"
    // almost always means "the card was never added to the record layout", so
    // the setup step beats another docs pointer.
    // PER-ITEM ADMIN MARKER (1.28.0; DE-GATED 1.29.0): each item MAY carry
    // "admin_only": false to mark a PER-USER surface (install the Chrome
    // extension, open the in-app extension page). ALL items render for EVERY
    // viewer (1.29.0, Jasper 2026-10-14 — hiding admin CTAs kept non-admins
    // from knowing what to ask their admin for, and HubSpot permissions are
    // more granular than super-admin); the marker only controls whether a
    // "(Super Admin)" hint is appended for non-admin viewers (missing marker
    // = admin surface = hinted). Before 1.29.0 the marker was a hard gate:
    // unmarked items rendered only for user.is_super_admin.
    // LEARN MORE REMOVED (1.26.0): the docs_url "Learn more →" link is NOT
    // rendered for now (Jasper 2026-10-14 — all docs links point at the same
    // single setup guide: noise until per-feature articles exist). docs_url
    // stays in the wire contract (reserved); re-enabling is a one-line revert.
    // Backends without CTAs emit nothing and render name + rationale only.
    "feature_usage": {
      "most_used": [
        { "key": "geocode_record", "name": "Geocode Records",
          "credits_or_events": 42 }  // + optional "unit" hint (see above)
      ],
      "not_in_use": [
        { "key": "nearby_lists", "name": "Nearby Lists",
          "docs_url": "https://www.growth-operations.com/help-articles/geocoding-setup-guide",
          "rationale": "Build static lists of the records nearest to any location.",
          "ctas": [
            { "label": "Add the Nearby Contacts card to office records",
              "url": "https://app.hubspot.com/layout-editor/{portal}/CRM_RECORD_PAGE/{object}/edit/HubspotProvided-CRM_RECORD_PAGE" }
          ] }
        // ...or a route item: { "label": "Set up your careers site", "route": "/careers-site" }
      ]
    },
    // Health v2: "attention" (new — was only ever healthy/critical) when
    // unresolved error-level alerts spike (>2 in the trailing week) OR
    // plan_fit recommends an upgrade; reasons[] carries the human text
    // ("3 error alerts this week", "You could save $40/mo on Professional").
    // "critical" stays reserved for subscription-ended/uninstalled.
    "health": { "level": "healthy", "reasons": [] }
  },

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
  // RETIRED (1.25.0): the ats "pipeline" tile — product decision 2026-10-14;
  // it duplicated the dedicated tabs and its cold-started counters read wrong
  // until churn. Backends may still emit "pipeline"; ui-shared ignores it.

  // PLANS — credit apps only. The pickable upgrade path for the Billing tab,
  // built from the Stripe catalog mirror (common.billing.catalog.get_plans).
  // Drives the shared <PlanGrid>. Tiers sorted by tier_order; each carries its
  // monthly and/or annual Stripe price_id for checkout. `current` marks the
  // tier the account is on (free grant => no current paid tier). Absent for
  // non-credit apps. talk_to_sales tiers (enterprise) hide price + checkout and
  // show a contact CTA instead.
  // EMPTY-CATALOG FALLBACK (2026-10-13 sparkfly incident): a catalog gap can
  // leave plans: [] for a CANCELED trial_subscription account — BillingTab
  // then hides the grid and instead renders a standalone "Restart your
  // previous plan" button hitting GET {billing_base_url}/v1/billing/restart/start
  // with NO price_id (the billing service resolves the account's last
  // subscription price server-side), gated on billing_action_tokens.restart.
  // Backends that predate the restart token render no button; the Stripe
  // portal link above the panel is the fallback path.
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

## Usage tab chart — days vs billing periods

`<UsageTab chart="days" | "billingPeriods">` (default `"days"`):

- **`days`** (legacy default): rolling-day LineChart fed by
  `GET {basePath}?portalId=&days=N` → `{series: [{date, credits}], used_in_window, granted, remaining}`
  (zero-filled, oldest first).
- **`billingPeriods`** (ATS; the shared `<BillingPeriodUsage>` component):
  stacked BarChart, one bar per billing period, stacks = features, lookback
  Select = Current / Last 2 / 3 / 6 / 12. Fed by
  `GET {basePath}?portalId=&periods=N` → `{series: [{period, feature, credits}], used_in_window, granted, remaining}`
  (SPARSE — no zero-filled bars; `period` is the backend's display label,
  e.g. "Oct 12 – Nov 12"; category x-axis renders in data order, so the
  backend returns oldest-first). Window math + bucketing live in common
  (`billing_period_windows`, `CreditService.usage_series_by_period`,
  common v1.35.0+). Non-standard hosts pass `fetchUsage={(periods) => …}`
  instead of `basePath`/`portalId` (the GOAA internal Installation card keys
  its endpoint by installation id); `showStats={false}` drops the stats tile
  for hosts with their own credit summary.

## Top banner (BillingBanner) — the ONE banner

Andrew 2026-10-13: a single banner at the top of EVERY page (mounted by the
app's layout, resolver `resolveBillingBanner`, credits arm only). Any condition
that STOPS the app flies RED (`variant: "error"`); "trial period active" flies
YELLOW (`variant: "warning"`). The separate Home-mounted `<TrialBanner>` is
retired — its (product-owner-approved) copy is reused verbatim, with the
`Need help? info@growthoperationsco.com` footer riding as microcopy.

Precedence (first match wins):

1. `threshold_state: "top_up_pending"` — info, no CTA
2. `threshold_state: "top_up_failed"` — RED, "Update payment method" portal CTA
3. `threshold_state: "limit_reached"` — warning, Billing CTA
4. out of credits WITH explicit signals (`threshold_state: "depleted"`, legacy
   `depleted`/`entitled: false`) — RED, pre-existing blocking copy
5. out of credits WITHOUT explicit signals (free grant, `remaining <= 0`) —
   RED, retired-TrialBanner copy
6. trial ended (`grant_expires_at` in the past, credits left, no plan) — RED,
   retired-TrialBanner copy. A lapsed clock explains a legacy `entitled:
   false` reading better than "out of credits", so this wins over that one
   legacy signal (never over an explicit depleted flag / threshold_state).
7. `over_included` (paid metered overage) — warning, never blocking
8. running low (free grant, `remaining <= low_threshold`) — warning
9. trial active (`grant_expires_at` in the future, no plan) — YELLOW countdown;
   yields only to running-low (the more urgent of the two yellow states)

Trial states require the credits arm, no paid plan (`plan == null`), and an
emitted `grant_expires_at`; paid/healthy accounts render no banner.

## Rules
- `entitlement.entitled` is the ONLY gate the UI/feature checks read. Backend computes it
  (trial: is_entitled status; credits: remaining > 0).
- Components are presentational: all app-specific content (onboarding steps, nudges, health
  reasons) is computed server-side. The package never hardcodes app logic.
- Optional blocks (health, sync_pulse, credit_meter, onboarding, nudges) may be
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

## Billing endpoints (base service)

For credit apps on the topup ("additional credits") model, the base service
exposes app-pages billing routes (verify_hubspot — the platform injects
Authorization; `portalId` rides as a query param like the other base-hosted
app_pages routes). The mutating routes carry a SECOND auth dep beyond
verify_hubspot: a required `token` query param with a billing action token
(common.billing.action_token; any action in the portal/checkout/upgrade/restart
vocabulary verifies) — the same proof of recent in-app billing-surface access
the /v1/billing/*/start endpoints require. ui-shared passes the
(interval-refreshed) `billing_action_tokens.portal`.

- `POST /v1/hubspot/app_pages/{app}/billing/auto-provision` with
  `{ "enabled": bool }` → `{ "status": "success", "auto_provision": { "enabled": bool } }`.
  Sets the portal's auto-provision toggle (state.auto_provision above;
  REPLACES the per-period spend cap). The GOAA top-up consumer consults the
  flag before charging: enabled = buy another pack when monthly credits run
  out; disabled = no purchase, actions fail the entitlement gate at zero.
- `POST /v1/hubspot/app_pages/{app}/billing/limit` with
  `{ "limit_cents": int | null }` — DEPRECATED (kept for older ui-shared
  versions). Superseded by auto-provision; the legacy field is no longer
  surfaced on the /home entitlement arm, and a legacy disabled/zero limit
  maps to `auto_provision.enabled == false`. A legacy POSITIVE limit was a
  spend ceiling, not an opt-out — it maps to `enabled == true` (uncapped
  auto-buy; see state.auto_provision above — mapping PENDING EXPLICIT
  SIGN-OFF).

The old `GET .../billing/top-ups` purchase-history endpoint was REMOVED: the
Billing tab's invoice history (`GET {billingBaseUrl}/v1/billing/invoices`)
already contains those purchases — pack invoices carry clean line-item
descriptions ("Additional credits — 1,000 credits", no trailing date range)
and `kind: "credit_top_up"`.
