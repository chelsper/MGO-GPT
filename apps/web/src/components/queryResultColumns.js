const DEFAULT_HIDDEN_HEADERS = new Set(["qrecid"]);

export function isQueryResultColumnVisible(header, setting) {
  if (typeof setting?.visible === "boolean") return setting.visible;
  return !DEFAULT_HIDDEN_HEADERS.has(String(header ?? "").trim().toLowerCase());
}
