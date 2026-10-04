export function cleanText(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function validDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}
