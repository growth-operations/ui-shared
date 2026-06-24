// TokenContext / TokenProvider / useToken — short-lived HubSpot token lifecycle.
//
// Wrap a tree in <TokenProvider context={context}> and any descendant can call
// useToken().ensureValidToken() to get a valid short-lived OAuth token, fetching
// a fresh one only when the cached one is missing or expired. The token data is
// held at module level (not React state) so it survives remounts and never
// triggers re-renders.
//
// The fetch goes through callAppApi (GET /api/v1/tokens/short-lived?portalId=...),
// so the hubspot.fetch rules live in app/base.js. The backend returns a token
// object exposing the access token as `token` (alias) / `access_token`, plus an
// `expires_at` epoch-seconds field used for cache invalidation.
import { createContext, useContext } from "react";
import { callAppApi } from "../app/base";
import { isTokenExpired } from "./getShortLivedToken";

const TokenContext = createContext(null);

// Module-level cache — doesn't cause re-renders, survives component remounts.
let cachedTokenData = null;
let tokenPromise = null;
let appContext = null;
// The short-lived-token endpoint. Defaults to the /api/v1 mount (toast/sparkfly);
// apps mounted at /v1 (e.g. ATS) pass tokenPath="/v1/tokens/short-lived" to
// TokenProvider. Same per-app override pattern as makeSettingsApi / AlertsTab.
let tokenPath = "/api/v1/tokens/short-lived";

// Fetch the full short-lived token object (token string + expires_at) for the
// current portal.
async function fetchTokenData(context) {
  const portalId = context?.portal?.id;
  const query = portalId ? `?portalId=${portalId}` : "";
  return callAppApi(context, `${tokenPath}${query}`, "GET");
}

// Return a valid access token string, fetching a fresh one if the cache is empty
// or expired. Concurrent callers share one in-flight fetch.
const ensureValidToken = async () => {
  if (cachedTokenData && !isTokenExpired(cachedTokenData)) {
    return cachedTokenData.token || cachedTokenData.access_token;
  }

  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const freshTokenData = await fetchTokenData(appContext);
      cachedTokenData = freshTokenData;
      tokenPromise = null;
      return freshTokenData.token || freshTokenData.access_token;
    } catch (err) {
      tokenPromise = null;
      throw err;
    }
  })();

  return tokenPromise;
};

// Force a refresh on the next ensureValidToken() call.
const invalidateToken = () => {
  cachedTokenData = null;
  tokenPromise = null;
};

// Stable context value — never changes identity, so it won't re-render consumers.
const stableValue = {
  ensureValidToken,
  invalidateToken,
  token: null,
  loading: false,
  error: null,
};

export function useToken() {
  const context = useContext(TokenContext);
  if (!context) {
    throw new Error("useToken must be used within a TokenProvider");
  }
  return context;
}

export function TokenProvider({ children, context, tokenPath: path }) {
  // Stash the extension context at module level so the token functions (which
  // live outside React) can reach it.
  appContext = context;
  // Per-app override for the short-lived-token endpoint (apps mounted at /v1).
  if (path) tokenPath = path;

  return (
    <TokenContext.Provider value={stableValue}>{children}</TokenContext.Provider>
  );
}

export { TokenContext };
