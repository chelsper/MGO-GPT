const BLACKBAUD_NXT_BASE_URL = "https://renxt.blackbaud.com";

export function buildBlackbaudConstituentProfileUrl(constituentId) {
  const normalizedId = String(constituentId || "").trim();
  if (!normalizedId) return "";

  return `${BLACKBAUD_NXT_BASE_URL}/constituents/${encodeURIComponent(normalizedId)}`;
}
