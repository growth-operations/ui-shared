# @growth-operations/ui-shared

Shared HubSpot UI-extension components for Growth Operations apps. One component
library serves all three app archetypes — `big_app` (toast, sparkfly), `ats`,
and `credit` — by rendering a single payload contract and branching on
`entitlement.mode`.

The components are **presentational**: every app-specific decision (onboarding
steps, nudges, health verdict, credit thresholds) is computed server-side and
delivered in the payload. The package never hardcodes app logic, an `app_key`,
or an app name.

## The /v1/home contract

Every app exposes `GET /api/v1/home?portalId={id}` (verify_hubspot) returning the
single payload these components render. The authoritative shape lives in
[CONTRACT.md](./CONTRACT.md) — read it first.

The one field every consumer gates on is the discriminated `entitlement` union:

```jsonc
// Arm A — big_app + ATS (maps onto common.entitlements.is_entitled)
{ "mode": "trial_subscription", "entitled": true, "status": "trialing", ... }

// Arm B — credit apps (net-new balance model)
{ "mode": "credits", "entitled": true, "granted": 100, "used": 37, "remaining": 63, ... }
```

`entitlement.entitled` is the only gate the UI/features read. Optional blocks
(`health`, `onboarding`, `nudges`, `sync_pulse`, `credit_meter`, `pipeline`,
`activation`) may be absent — each component renders nothing when its block is
missing.

## Consuming the package

Add the dependency (pin the exact version — see Versioning):

```jsonc
// project/app/app.functions/package.json (or the extension's package.json)
{ "dependencies": { "@growth-operations/ui-shared": "1.0.0" } }
```

Install into the HubSpot project so the bundler picks it up:

```bash
hs project install-deps
```

Render Home with the single opinionated component:

```jsx
import { AppHome } from "@growth-operations/ui-shared";

function Home({ context }) {
  const [state, setState] = useState(null); // GET /api/v1/home
  return (
    <AppHome
      state={state}
      appName="Sparkfly Sync"
      onNavigate={(route) => actions.openIframeModal(/* or your router */)}
    />
  );
}
```

`AppHome` composes the lifecycle: loading spinner → `InstallProgress` (until
activation completes) → the activated cockpit (`HealthHero` + onboarding +
the archetype tile + nudges).

Render the shared Billing tab (pass the Stripe `app_key` as a prop — never
hardcoded in the package):

```jsx
import { BillingTab } from "@growth-operations/ui-shared";

<BillingTab context={context} state={state} appKey="hubspot_sparkfly" />;
```

`BillingTab` branches on `entitlement.mode`: `trial_subscription` shows the
Stripe Customer Portal link + color-coded status panel; `credits` shows the
`CreditMeter` + a "pick a plan / buy credits" CTA.

### Individual exports

`AppHome`, `InstallProgress`, `HealthHero`, `OnboardingChecklist`, `SyncPulse`,
`FeatureNudges`, `CreditMeter`, `BillingTab`, plus the lib helpers `fmtDate`,
`daysUntil`, `humanizeStatus`, `statusVariant`, and `useStrictModeEffect`.

## SDK

`src/sdk/` is the Growth Ops HubSpot app SDK: the token + API utility layer that
every token-using app used to reimplement. Use it instead of hand-rolling
`hubspot.fetch` calls in each app. Everything is re-exported from the package
root, so `import { callAppApi } from "@growth-operations/ui-shared"` works.

### `hubspot.fetch` rules (why this SDK exists)

These two rules have repeatedly cost real debugging time; the SDK enforces both
so callers never have to remember them:

1. **Body is a plain object — never `JSON.stringify` it.** `hubspot.fetch`
   serializes the body for you; a pre-stringified body is rejected/mangled. Pass
   `{ foo: "bar" }`, not `'{"foo":"bar"}'`.
2. **No custom headers.** The platform injects `Authorization` for calls to your
   own backend, so `callAppApi` sends no headers at all. For direct HubSpot API
   calls, `Authorization: Bearer <token>` is the *one* permitted client header —
   `callHubSpotApi` sends only that.

### App backend — `callAppApi`

Calls your app's own Cloud Run backend at `context.variables.BASE_URL`:

```js
import { callAppApi, AppApiError } from "@growth-operations/ui-shared";

// body is a plain object (NOT JSON.stringify'd)
const result = await callAppApi(context, "/api/v1/settings", "PUT", { foo: 1 });
// throws AppApiError(message, statusCode, responseText) on non-2xx;
// FastAPI {"detail": "..."} bodies are unwrapped into the message.
```

Built on top of `callAppApi`:

- `getSettings(context, { force })` / `updateSettings(context, body)` — module-cached
  settings client (`force: true` bypasses the cache, e.g. when polling). Use
  `makeSettingsApi({ path })` for a client with its own cache or a different path.
- `getAlerts(context, params)` / `dismissAlert(context, alertId)` — the generic
  `/api/v1/alerts` surface (`offset`, `limit`, `orderBy`, `orderDirection`,
  `filterField`, `filterValue`).

### HubSpot public API — `callHubSpotApi`

Direct calls to `api.hubapi.com` with a short-lived OAuth token:

```js
import { callHubSpotApi, buildHubSpotUrl, HubSpotApiError } from "@growth-operations/ui-shared";

const url = buildHubSpotUrl("crm/v3/properties/contacts");
const data = await callHubSpotApi(url, token); // GET
// POST/PATCH bodies are plain objects too:
await callHubSpotApi(url, token, "POST", { query: "x", count: 100 });
```

Resource fetchers built on it (all take `(context, token, ...)`):
`getObjectProperties(context, token, objectType)` (picker-shaped, filtered),
`getProperties` (raw), `updateProperties(context, token, properties)`,
`getForms`, `getLists(context, token, query)`,
`getPipelines` / `getPipelineStages` / `computeStageChanges`.

### Token lifecycle — `getShortLivedToken` / `TokenProvider`

`getShortLivedToken(context)` fetches a short-lived HubSpot OAuth token from the
app backend (`GET /api/v1/tokens/short-lived?portalId=...`) and returns the token
string. For React trees, wrap with `TokenProvider` and read the token via
`useToken()`, which caches by `expires_at` at module level (survives remounts, no
re-renders):

```jsx
import { TokenProvider, useToken, callHubSpotApi, buildHubSpotUrl } from "@growth-operations/ui-shared";

function Root({ context }) {
  return (
    <TokenProvider context={context}>
      <Mapper />
    </TokenProvider>
  );
}

function Mapper() {
  const { ensureValidToken, invalidateToken } = useToken();
  async function load() {
    const token = await ensureValidToken(); // fetches/refreshes as needed
    return callHubSpotApi(buildHubSpotUrl("marketing/v3/forms"), token);
  }
  // ...
}
```

### CRM-card encryption

`encrypt(data, context)` / `decrypt(ciphertext, context)` plus the primitives
`strToBase64`, `base64ToStr`, `getKeyFromContext`. AES-GCM keyed to the current
CRM record (`context.extension.objectTypeId` + `context.crm.objectId`), so usable
only in a CRM-card context.

### SDK exports

`callAppApi`, `AppApiError`, `getSettings`, `updateSettings`, `makeSettingsApi`,
`getAlerts`, `dismissAlert`, `callHubSpotApi`, `buildHubSpotUrl`,
`HubSpotApiError`, `getObjectProperties`, `getProperties`, `updateProperties`,
`getForms`, `getLists`, `getPipelines`, `getPipelineStages`,
`computeStageChanges`, `getShortLivedToken`, `isTokenExpired`, `TokenProvider`,
`useToken`, `TokenContext`, `encrypt`, `decrypt`, `strToBase64`, `base64ToStr`,
`getKeyFromContext`.

## Peer dependencies

`react` and `@hubspot/ui-extensions` are **peer dependencies** — they are
provided by the consuming HubSpot app, not bundled here. The package imports
from them but never ships its own copy, so a single React/UI-extensions runtime
is shared.

## Versioning

Pin **exact** versions in consuming apps (`"1.0.0"`, not `"^1.0.0"`). These
components render a shared contract across multiple apps; an unexpected minor
bump should be an explicit, reviewed change, not an automatic upgrade. Publishing
is automated: pushing a `v*` tag runs `.github/workflows/publish.yml`, which
`npm publish --access public`.
