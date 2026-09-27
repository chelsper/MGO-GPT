export const SOCIETY_LETTERS_PATH = "/stewardship/society-letters";

export const LETTER_VIEWS = {
  ready: "Holding list",
  excluded: "Excluded",
  history: "Letter history",
  setup: "Setup checklist",
  settings: "Source & period",
  fields: "Query fields",
  templates: "Letter templates",
  appeals: "Appeal settings",
};

export function letterView(value) {
  return Object.hasOwn(LETTER_VIEWS, value) ? value : "ready";
}

export function letterViewHref(view) {
  const key = letterView(view);
  return key === "ready"
    ? SOCIETY_LETTERS_PATH
    : `${SOCIETY_LETTERS_PATH}?view=${key}`;
}

// This return link accepts workspace views only, not arbitrary destinations.
export function societyLetterReturnPath(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value, "https://navigation.invalid");
    if (
      !value.startsWith(SOCIETY_LETTERS_PATH) ||
      url.origin !== "https://navigation.invalid" ||
      url.pathname !== SOCIETY_LETTERS_PATH
    )
      return "";
    return letterViewHref(url.searchParams.get("view"));
  } catch {
    return "";
  }
}
