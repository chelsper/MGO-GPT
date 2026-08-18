export const WORKSPACE_ROLES = Object.freeze({
  ADMIN: "admin",
  ADVANCEMENT_SERVICES: "advancement_services",
  EXECUTIVE: "executive",
  MGO: "mgo",
});

const ROLE_LABELS = Object.freeze({
  [WORKSPACE_ROLES.ADMIN]: "Admin",
  [WORKSPACE_ROLES.ADVANCEMENT_SERVICES]: "Advancement Services",
  [WORKSPACE_ROLES.EXECUTIVE]: "Executive",
  [WORKSPACE_ROLES.MGO]: "MGO",
});

function normalizeSingleWorkspaceRole(role) {
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

export function normalizeWorkspaceRoles(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  const normalized = [];
  for (const rawValue of rawValues) {
    const role = normalizeSingleWorkspaceRole(rawValue);
    if (role && !normalized.includes(role)) {
      normalized.push(role);
    }
  }

  return normalized;
}

export function serializeWorkspaceRoles(value) {
  return normalizeWorkspaceRoles(value).join(",");
}

// Older records are normalized at the boundary so role migrations do not
// interrupt existing access while the database is being upgraded.
export function normalizeWorkspaceRole(role) {
  return normalizeWorkspaceRoles(role)[0] || null;
}

export function hasWorkspaceRole(roles, expectedRole) {
  return normalizeWorkspaceRoles(roles).includes(expectedRole);
}

export function isAdminRole(role) {
  return hasWorkspaceRole(role, WORKSPACE_ROLES.ADMIN);
}

export function isAdvancementServicesRole(role) {
  return hasWorkspaceRole(role, WORKSPACE_ROLES.ADVANCEMENT_SERVICES);
}

// Kept for existing imports while callers move to the clearer name above.
export function isAdvancementAdminRole(role) {
  return isAdvancementServicesRole(role);
}

export function isExecutiveRole(role) {
  return hasWorkspaceRole(role, WORKSPACE_ROLES.EXECUTIVE);
}

// Kept for existing imports while callers move to the clearer name above.
export function isExecutiveAdminRole(role) {
  return isExecutiveRole(role);
}

export function canUseExecutiveViewRole(role) {
  return isAdminRole(role) || isExecutiveRole(role);
}

// Executive users may inspect MGO workspaces. Admins may additionally inspect
// Executive workspaces without broadening either role's underlying access.
export function canViewWorkspaceAsRole(viewerRole, targetRole) {
  if (!canUseExecutiveViewRole(viewerRole)) return false;
  if (isMgoRole(targetRole)) return true;
  return isAdminRole(viewerRole) && isExecutiveRole(targetRole);
}

export function isReviewerRole(role) {
  return isAdminRole(role) || isAdvancementServicesRole(role);
}

export function canManageWorkspaceRole(role) {
  return isAdminRole(role) || isAdvancementServicesRole(role);
}

export function isMgoRole(role) {
  return hasWorkspaceRole(role, WORKSPACE_ROLES.MGO);
}

export function canUseMgoWorkspaceRole(role) {
  return isMgoRole(role) || isExecutiveRole(role);
}

export function isAssignableRole(role) {
  const normalized = normalizeWorkspaceRoles(role);
  if (!normalized.length) return false;
  return normalized.length === (Array.isArray(role)
    ? role.filter(Boolean).length
    : String(role || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean).length);
}

export function getWorkspaceRoleLabel(role) {
  const roles = normalizeWorkspaceRoles(role);
  if (!roles.length) return role || "User";
  return roles.map((value) => ROLE_LABELS[value] || value).join(", ");
}
