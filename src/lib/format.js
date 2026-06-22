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

// Date + time, for logs where multiple events share a day (usage history). "—"
// when null/unparseable.
export function fmtDateTime(value) {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Whole days from now until `value` (negative = past). null if unparseable.
export function daysUntil(value) {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - Date.now()) / (1000 * 60 * 60 * 24));
}

// Stripe amount (smallest currency unit, e.g. cents) -> "$29" / "€29.50".
// Whole amounts drop the decimals; null/undefined -> "—". Currency defaults to
// USD; falls back to an uppercased code prefix for currencies Intl can't symbol.
export function fmtMoney(unitAmount, currency = "usd") {
  if (unitAmount == null) return "—";
  const amount = unitAmount / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${(currency || "usd").toUpperCase()} ${amount}`;
  }
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
