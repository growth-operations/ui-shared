import React, { useState } from "react";
import { Select, LoadingSpinner, Alert, Flex, Text, Link } from "@hubspot/ui-extensions";
import { useToken } from "../sdk/index";
import { getForms } from "../sdk/hubspot/forms";
import { getLists } from "../sdk/hubspot/lists";
import { getPipelines, getPipelineStages } from "../sdk/hubspot/pipeline";
import { useStrictModeEffect } from "../lib/useStrictModeEffect";

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
    const { lists = [] } = await getLists(context, token, opts?.query ?? "");
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
  // Extra source args (pipelineId/objectType for pipelineStages, query for lists)
  ...opts
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { ensureValidToken } = useToken();

  // Re-fetch when the source or its key args change (e.g. pipelineId).
  const depKey = JSON.stringify({
    source,
    pipelineId: opts.pipelineId,
    objectType: opts.objectType,
    query: opts.query,
  });

  useStrictModeEffect(
    async ({ mounted }) => {
      try {
        const token = await ensureValidToken();
        if (!token || !mounted.current) return;
        const loader =
          fetchOptions ?? SOURCES[source] ?? (async () => []);
        const opted = await loader(context, token, opts);
        if (mounted.current) setOptions(opted);
      } catch (e) {
        if (mounted.current) setError(String(e?.message ?? e));
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [context, depKey]
  );

  if (loading) {
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
