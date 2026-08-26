const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/**
 * Locale-aware relative time via Intl.RelativeTimeFormat.
 * Accepts unix seconds (number) or an ISO string.
 */
export function relativeTime(ts) {
  if (!ts) return "never";
  const ms =
    typeof ts === "number" ? ts * 1000 : new Date(ts).getTime();
  const diffMs = ms - Date.now();
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 2) return "just now";
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}
