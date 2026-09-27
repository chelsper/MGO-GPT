export const DEFAULT_DASHBOARD_ASSISTANT = Object.freeze({ enabled: true, name: "Nellie", avatar: "dolphin" });

export function normalizeDashboardAssistant(value) {
  return {
    enabled: value?.enabled !== false,
    name: typeof value?.name === "string" && value.name.trim() ? value.name.trim().slice(0, 40) : "Nellie",
    avatar: value?.avatar === "compass" ? "compass" : "dolphin",
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
  return null;
}
