import React from "react";
import { Flex, Text, Link, Divider } from "@hubspot/ui-extensions";

// Build the in-app app-pages deep link (the app's Home/tabs live under /app).
function appPagesUrl(portalId, appId, pagePath = "") {
  const suffix = pagePath ? `/${pagePath.replace(/^\//, "")}` : "";
  return `https://app.hubspot.com/app/${portalId}/${appId}${suffix}`;
}

// HelpfulLinks — a standard "Helpful Links" section for every Growth Operations
// app. Renders a labeled list of links: optionally an "Open <app>" deep link
// back to the app pages (so the settings extension isn't a dead end), docs +
// support from the app config, and any app-specific extras.
//
// Props:
//   portalId   — context.portal.id (number/string).
//   appId      — this app's HubSpot app id (per-env). Needed for the app-pages
//                deep link; omit to hide that link.
//   appName    — display name, e.g. "Sparkfly" (used in the deep-link label).
//   appPages   — when true (default) and appId is set, show "Open <appName> →"
//                linking to the app pages. Set the page path via appPagesPath.
//   appPagesPath — optional pages route to deep-link into (default: Home).
//   docsUrl, supportUrl — external help links (omit to hide).
//   links      — app-specific extras: [{ label, url }]. Rendered after the
//                standard links.
//   title      — section heading (default "Helpful Links").
export function HelpfulLinks({
  portalId,
  appId,
  appName = "the app",
  appPages = true,
  appPagesPath = "",
  docsUrl,
  supportUrl,
  links = [],
  title = "Helpful Links",
}) {
  // external=false keeps navigation in the SAME tab. The app-pages deep link is
  // an in-app HubSpot URL, so it must stay same-tab (external:true would force a
  // new tab). Docs/support and app-specific extras are off-platform → external.
  const items = [];

  if (appPages && appId && portalId != null) {
    items.push({
      label: `Open ${appName} →`,
      url: appPagesUrl(portalId, appId, appPagesPath),
      external: false,
    });
  }
  if (docsUrl) items.push({ label: "Documentation", url: docsUrl, external: true });
  if (supportUrl) items.push({ label: "Support", url: supportUrl, external: true });
  for (const l of links) {
    if (l && l.url && l.label) {
      // Default app-specific extras to external (they're usually HubSpot record
      // URLs or off-platform), but let a link opt into same-tab via external:false.
      items.push({ label: l.label, url: l.url, external: l.external !== false });
    }
  }

  if (items.length === 0) return null;

  return (
    <Flex direction="column" gap="small">
      <Text format={{ fontWeight: "bold" }}>{title}</Text>
      <Divider />
      {items.map((item) => (
        <Link key={item.url} href={{ url: item.url, external: item.external }}>
          {item.label}
        </Link>
      ))}
    </Flex>
  );
}

export default HelpfulLinks;
