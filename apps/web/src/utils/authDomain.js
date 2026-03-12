export const WORKSPACE_EMAIL_DOMAIN =
  process.env.WORKSPACE_EMAIL_DOMAIN?.toLowerCase() || "ju.edu";

export function isAllowedWorkspaceEmail(email) {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${WORKSPACE_EMAIL_DOMAIN}`);
}

export function workspaceEmailAccessMessage() {
  return `Access is limited to ${WORKSPACE_EMAIL_DOMAIN} email addresses.`;
}
