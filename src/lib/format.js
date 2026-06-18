// Shared formatting + status helpers for Growth Operations app UIs.
// Framework-agnostic (no React) so they can be unit-reasoned and reused.

// ISO datetime string (or ms epoch) -> "Mon DD, YYYY", null-safe.
// new Date(NaN).toLocaleDateString() would throw, so guard it.
export function fmtDate(value) {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Whole days from now until `value` (negative = past). null if unparseable.
export function daysUntil(value) {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - Date.now()) / (1000 * 60 * 60 * 24));
}

// Friendly labels for the AppInstallStatus enum (shared across apps).
export const STATUS_LABELS = {
  trialing: "Free trial",
  active: "Active",
  pending_purchase: "Trial ended — choose a plan",
  past_due: "Payment past due",
  paused: "Paused",
  canceled: "Canceled",
  uninstalled: "Uninstalled",
  sandbox_trial: "Sandbox trial",
  sandbox_linked: "Sandbox",
  not_installed: "Not installed",
};

export function humanizeStatus(status) {
  return STATUS_LABELS[status] ?? (status ? String(status) : "Unknown");
}

// Color-code status so it reads at a glance: green = good standing,
// yellow = needs attention soon, red = action required.
export const STATUS_VARIANT = {
  active: "success",
  trialing: "warning",
  sandbox_trial: "warning",
  sandbox_linked: "success",
  pending_purchase: "warning",
  past_due: "error",
  paused: "warning",
  canceled: "error",
};

export function statusVariant(status) {
  return STATUS_VARIANT[status] ?? "info";
}
