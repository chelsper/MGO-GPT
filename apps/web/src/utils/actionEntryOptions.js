export const ACTION_CATEGORIES = ["Meeting", "Phone Call", "Email", "Task"];
export const INTERACTION_TYPES = [
  "Cultivation", "Identification / Discovery", "Other",
  "Qualification / Re-engagement", "Solicitation", "Stewardship",
];

export function validActionDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
