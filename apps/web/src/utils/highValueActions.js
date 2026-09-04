function label(value) {
  if (value && typeof value === "object") return String(value.description || value.name || value.label || "").trim();
  return typeof value === "string" ? value.trim() : "";
}

export function getNxtActionCategory(action) {
  return label(action?.category || action?.action_category || action?.actionCategory);
}

export function getNxtActionType(action) {
  return label(action?.["type.description"] || action?.type || action?.interaction_type || action?.interactionType);
}

export function isHighValueAction(action) {
  return getNxtActionCategory(action).toLowerCase() === "meeting" ||
    getNxtActionType(action).toLowerCase() === "solicitation";
}
