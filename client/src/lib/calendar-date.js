const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

// Date.parse normalizes impossible dates (for example, February 31 becomes March 3).
// Round-tripping the UTC date keeps validation strict while preserving the YYYY-MM-DD value.
export function isCalendarDate(value) {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
