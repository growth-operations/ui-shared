import React, { useEffect, useRef, useState } from "react";
import { Select, LoadingSpinner, Alert, Flex, Text, Link } from "@hubspot/ui-extensions";
import { useToken } from "../sdk/index";
import { getForms } from "../sdk/hubspot/forms";
import { getLists } from "../sdk/hubspot/lists";
import { getPipelines, getPipelineStages } from "../sdk/hubspot/pipeline";
import { useStrictModeEffect } from "../lib/useStrictModeEffect";

// How long to wait after the user stops typing before re-querying the
// source. HubSpot's Select docs recommend debouncing onInput, which
// fires on every keystroke.
const SEARCH_DEBOUNCE_MS = 300;

// OptionSelect — one shared HubSpot-options dropdown, replacing the per-app
// FormSelector / SegmentSelector / PipelineStageSelector that every app
// re-implemented (fetch options → map to {label,value} → <Select> → save on
// change). The data-fetch half already lives in the SDK (getForms / getLists /
// getPipelineStages); this owns the loading/error/Select chrome around it.
//
// Pick options ONE of two ways:
//   - source="forms" | "lists" | "pipelines" | "pipelineStages" — built-in SDK
//     fetchers. "pipelines"/"pipelineStages" take opts.objectType; the latter
//     also needs opts.pipelineId.
//   - fetchOptions={async (context, token) => [{label, value}, ...]} — any
//     custom source. Takes precedence over `source`.
//
// onChange(value) fires with the selected value; the caller owns persistence
// (e.g. ui-shared updateSettings). `value` is the controlled selection.
const SOURCES = {
  forms: async (context, token) => {
    const { results = [] } = await getForms(context, token);
    return results.map((f) => ({ label: f.name, value: f.id }));
  },
  lists: async (context, token, opts) => {
    const { lists = [] } = await getLists(
      context,
      token,
      opts?.query ?? "",
      opts?.objectTypeId ?? null
    );
    return lists.map((l) => ({ label: l.name, value: String(l.listId) }));
  },
  pipelines: async (context, token, opts) => {
    const { results = [] } = await getPipelines(context, token, opts?.objectType);
    return results.map((p) => ({ label: p.label, value: p.id }));
  },
  pipelineStages: async (context, token, opts) => {
    if (!opts?.pipelineId) return [];
    const { results = [] } = await getPipelineStages(
      context,
      token,
      opts.pipelineId,
      opts.objectType
    );
    return results.map((s) => ({ label: s.label, value: s.id }));
  },
};

export function OptionSelect({
  context,
  value,
  onChange,
  source,
  fetchOptions,
  label = "Select",
  description,
  placeholder = "Choose…",
  // Optional action links rendered beside the dropdown (e.g. "Create new list",
  // "Edit form") — the affordances the per-app FormSelector/SegmentSelector used
  // to have. Each: { label, url }. Rendered as external links (new tab). When a
  // url is null/absent the link is skipped, so callers can pass an "Edit" action
  // gated on a selected value.
  actions = [],
  // Extra source args (pipelineId/objectType for pipelineStages, query/objectTypeId for lists)
  ...opts
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState(null);
  // The live search term, committed only after SEARCH_DEBOUNCE_MS of no
  // typing — this is what actually triggers a re-fetch. `Select`'s
  // `onInput` fires on every keystroke; debouncing here is what HubSpot's
  // docs recommend instead of updating state directly in that callback.
  const [searchTerm, setSearchTerm] = useState(opts.query ?? "");
  const debounceRef = useRef(null);
  const { ensureValidToken } = useToken();

  const handleInput = (v) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(v), SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Re-fetch when the source, its key args, or the search term change.
  const depKey = JSON.stringify({
    source,
    pipelineId: opts.pipelineId,
    objectType: opts.objectType,
    objectTypeId: opts.objectTypeId,
    searchTerm,
  });

  useStrictModeEffect(
    async ({ mounted }) => {
      try {
        const token = await ensureValidToken();
        if (!token || !mounted.current) return;
        const loader =
          fetchOptions ?? SOURCES[source] ?? (async () => []);
        const opted = await loader(context, token, { ...opts, query: searchTerm });
        if (mounted.current) setOptions(opted);
      } catch (e) {
        if (mounted.current) setError(String(e?.message ?? e));
      } finally {
        if (mounted.current) {
          setLoading(false);
          setInitialLoad(false);
        }
      }
    },
    [context, depKey]
  );

  // Only the first fetch replaces the whole component with a spinner.
  // Re-fetches triggered by typing a search term keep `Select` mounted
  // (with its current options) so the dropdown doesn't visibly close
  // and the user doesn't lose focus/typed text mid-search.
  if (loading && initialLoad) {
    return <LoadingSpinner size="small" label={`Loading ${label.toLowerCase()}…`} showLabel />;
  }
  if (error) {
    return (
      <Alert title={`Couldn't load ${label.toLowerCase()}`} variant="danger">
        <Text>{error}</Text>
      </Alert>
    );
  }

  const actionLinks = (actions || []).filter((a) => a && a.url);

  return (
    <Flex direction="column" gap="extra-small">
      <Select
        label={label}
        description={description}
        placeholder={placeholder}
        options={options}
        value={value ?? ""}
        onChange={(v) => onChange?.(v)}
        onInput={handleInput}
      />
      {actionLinks.length > 0 && (
        <Flex direction="row" gap="small">
          {actionLinks.map((a) => (
            <Link key={a.label} href={{ url: a.url, external: true }}>
              {a.label}
            </Link>
          ))}
        </Flex>
      )}
    </Flex>
  );
}
