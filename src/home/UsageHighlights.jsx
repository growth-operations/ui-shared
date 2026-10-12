// Reserved slot for the later "most used / not in use" Home section
// (separate workstream — do NOT build it here). AppHome renders this directly
// below PeriodComparison in the post-checklist cockpit; it intentionally
// renders nothing until that section lands, so the composition boundary is
// already in place.
export function UsageHighlights({ state }) {
  return null;
}

export default UsageHighlights;
