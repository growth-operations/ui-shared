// HubSpot contact-list fetcher (for list-selection pickers).
//
// Paginates crm/v3/lists/search until all DYNAMIC lists are collected. The POST
// body is a plain OBJECT — callHubSpotApi sends it as-is (NEVER JSON.stringify).
import { buildHubSpotUrl, callHubSpotApi } from "./base";

// context is accepted for signature consistency. query: optional name filter.
export async function getLists(context, token, query = "") {
  const url = buildHubSpotUrl("crm/v3/lists/search");
  const allLists = [];
  let offset = 0;
  let hasMore = true;
  const count = 100; // Max count per request.

  while (hasMore) {
    const payload = {
      query: query,
      count: count,
      offset: offset,
      processingTypes: ["DYNAMIC"],
    };

    const response = await callHubSpotApi(url, token, "POST", payload);
    allLists.push(...response.lists);

    hasMore = response.hasMore;
    offset = response.offset;
  }

  return { lists: allLists };
}
