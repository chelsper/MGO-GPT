export const WORKSPACE_ROLES = Object.freeze({
  ADMIN: "admin",
  ADVANCEMENT_SERVICES: "advancement_services",
  EXECUTIVE: "executive",
  MGO: "mgo",
});

// Older records are normalized at the boundary so role migrations do not
// interrupt existing access while the database is being upgraded.
export function normalizeWorkspaceRole(role) {
  switch (String(role || "").trim().toLowerCase()) {
    case "admin":
      return WORKSPACE_ROLES.ADMIN;
    case "reviewer":
    case "advancement_admin":
    case "advancement_services":
      return WORKSPACE_ROLES.ADVANCEMENT_SERVICES;
    case "executive_admin":
    case "executive":
      return WORKSPACE_ROLES.EXECUTIVE;
    case "mgo":
      return WORKSPACE_ROLES.MGO;
    default:
      return null;
  }
}

export function isAdminRole(role) {
  return normalizeWorkspaceRole(role) === WORKSPACE_ROLES.ADMIN;
}

export function isAdvancementServicesRole(role) {
  return normalizeWorkspaceRole(role) === WORKSPACE_ROLES.ADVANCEMENT_SERVICES;
}

// Kept for existing imports while callers move to the clearer name above.
export function isAdvancementAdminRole(role) {
  return isAdvancementServicesRole(role);
}

export function isExecutiveRole(role) {
  return normalizeWorkspaceRole(role) === WORKSPACE_ROLES.EXECUTIVE;
}

// Kept for existing imports while callers move to the clearer name above.
export function isExecutiveAdminRole(role) {
  return isExecutiveRole(role);
}

export function canUseExecutiveViewRole(role) {
  return isAdminRole(role) || isExecutiveRole(role);
}

export function isReviewerRole(role) {
  return isAdminRole(role) || isAdvancementServicesRole(role);
}

export function canManageWorkspaceRole(role) {
  return isAdminRole(role) || isAdvancementServicesRole(role);
}

export function isMgoRole(role) {
  return normalizeWorkspaceRole(role) === WORKSPACE_ROLES.MGO;
}

export function canUseMgoWorkspaceRole(role) {
  return isMgoRole(role) || isExecutiveRole(role);
}

export function isAssignableRole(role) {
  return Boolean(normalizeWorkspaceRole(role));
}

export function getWorkspaceRoleLabel(role) {
  switch (normalizeWorkspaceRole(role)) {
    case WORKSPACE_ROLES.ADMIN:
      return "Admin";
    case WORKSPACE_ROLES.ADVANCEMENT_SERVICES:
      return "Advancement Services";
    case WORKSPACE_ROLES.EXECUTIVE:
      return "Executive";
    case WORKSPACE_ROLES.MGO:
      return "MGO";
    default:
      return role || "User";
  }
}
