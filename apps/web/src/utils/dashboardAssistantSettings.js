export const HELPER_NUMBER_FIELDS = Object.freeze({
  followUpDays: { label: "Upcoming follow-ups (days)", min: 1, max: 30 },
  opportunityDays: { label: "Upcoming opportunity dates (days)", min: 1, max: 90 },
  recentGiftDays: { label: "Recent gifts (days, including today)", min: 1, max: 90 },
  giftMinimum: { label: "Suggest stewardship for gifts over (USD)", min: 0, max: 1000000 },
  majorGiftMinimum: { label: "Offer documentation checks at or above (USD)", min: 1, max: 10000000 },
});
export const HELPER_TONES = Object.freeze({ warm: "Warm and conversational", professional: "Professional", concise: "Brief and direct" });
export const DEFAULT_DASHBOARD_ASSISTANT = Object.freeze({
  enabled: true, name: "Nellie", avatar: "dolphin", followUpDays: 7, opportunityDays: 30,
  recentGiftDays: 30, giftMinimum: 1000, majorGiftMinimum: 10000, tone: "warm", thankYouMessage: "",
});
const validNumber = (key, value) => Number.isInteger(value) && value >= HELPER_NUMBER_FIELDS[key].min && value <= HELPER_NUMBER_FIELDS[key].max;
const unsafeText = /[\u0000-\u0009\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

export function normalizeDashboardAssistant(value) {
  const numbers = Object.fromEntries(Object.keys(HELPER_NUMBER_FIELDS).map(key => [key, validNumber(key, value?.[key]) ? value[key] : DEFAULT_DASHBOARD_ASSISTANT[key]]));
  if (numbers.majorGiftMinimum <= numbers.giftMinimum) numbers.majorGiftMinimum = Math.max(10000, numbers.giftMinimum + 1);
  return {
    enabled: value?.enabled !== false,
    name: typeof value?.name === "string" && value.name.trim() ? value.name.trim().slice(0, 40) : "Nellie",
    avatar: value?.avatar === "compass" ? "compass" : "dolphin",
    ...numbers,
    tone: Object.hasOwn(HELPER_TONES, value?.tone || "") ? value.tone : "warm",
    thankYouMessage: typeof value?.thankYouMessage === "string" && value.thankYouMessage.length <= 1200 && !unsafeText.test(value.thankYouMessage)
      ? value.thankYouMessage.trim() : "",
  };
}

export function validateDashboardAssistant(value) {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !Object.hasOwn(DEFAULT_DASHBOARD_ASSISTANT, key)) ||
      typeof value.enabled !== "boolean" || typeof value.name !== "string" || !value.name.trim() ||
      value.name.trim().length > 40 || /[\u0000-\u001f\u007f]/.test(value.name) ||
      !["dolphin", "compass"].includes(value.avatar)) {
    return "Choose a helper name (1-40 characters), an available avatar, and whether it is enabled.";
  }
  for (const [key, field] of Object.entries(HELPER_NUMBER_FIELDS)) {
    if (value[key] !== undefined && !validNumber(key, value[key])) return `${field.label} must be a whole number from ${field.min} to ${field.max}.`;
  }
  if (value.giftMinimum !== undefined && value.majorGiftMinimum !== undefined && value.majorGiftMinimum <= value.giftMinimum) {
    return "The documentation-check threshold must be higher than the stewardship suggestion threshold.";
  }
  if (value.tone !== undefined && !Object.hasOwn(HELPER_TONES, value.tone)) return "Choose an available draft tone.";
  if (value.thankYouMessage !== undefined && (typeof value.thankYouMessage !== "string" || value.thankYouMessage.length > 1200 || unsafeText.test(value.thankYouMessage))) {
    return "Thank-you wording must be plain text of at most 1,200 characters, without control characters.";
  }
  return null;
}

export function dashboardReminderPolicy(value) {
  const settings = normalizeDashboardAssistant(value);
  return Object.fromEntries(Object.keys(HELPER_NUMBER_FIELDS).map(key => [key, settings[key]]));
}
