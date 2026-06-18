import React from "react";
import { Flex, Tile, Text, Link, Button } from "@hubspot/ui-extensions";

// Mode B: "get more from <app>" — surfaces unused/under-used capabilities the
// backend detected (/v1/home nudges block). Each nudge is app-specific copy
// computed server-side (e.g. sparkfly: "turn on bidirectional sync",
// "map more fields"). Renders nothing when there are no nudges.
//
// `onNavigate(route)` lets a nudge deep-link to an in-app route; cta_url is an
// external/settings deep link.
export function FeatureNudges({ nudges, onNavigate, title = "Get more from this app" }) {
  if (!Array.isArray(nudges) || nudges.length === 0) return null;

  return (
    <Tile>
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: "bold" }}>{title}</Text>
        {nudges.map((n) => (
          <Flex key={n.key} direction="column" gap="extra-small">
            <Text format={{ fontWeight: "demibold" }}>{n.title}</Text>
            <Text>{n.message}</Text>
            {n.cta_url ? (
              <Link href={{ url: n.cta_url, external: true }}>
                {n.cta_label ?? "Set it up"} →
              </Link>
            ) : n.cta_route && onNavigate ? (
              <Button variant="secondary" onClick={() => onNavigate(n.cta_route)}>
                {n.cta_label ?? "Set it up"}
              </Button>
            ) : null}
          </Flex>
        ))}
      </Flex>
    </Tile>
  );
}

export default FeatureNudges;
