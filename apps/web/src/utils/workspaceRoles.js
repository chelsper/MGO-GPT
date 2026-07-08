export function isAdminRole(role) {
  return role === "admin";
}

export function isAdvancementAdminRole(role) {
  return role === "advancement_admin";
}

export function isExecutiveAdminRole(role) {
  return role === "executive_admin";
}

export function canUseExecutiveViewRole(role) {
  return isAdminRole(role) || isExecutiveAdminRole(role);
}

export function isReviewerRole(role) {
  return role === "reviewer" || role === "admin" || isAdvancementAdminRole(role);
}

export function canManageWorkspaceRole(role) {
  return isAdminRole(role) || isAdvancementAdminRole(role);
}

export function isMgoRole(role) {
  return role === "mgo";
}

export function isAssignableRole(role) {
  return (
    role === "mgo" ||
    role === "reviewer" ||
    role === "advancement_admin" ||
    role === "executive_admin"
  );
}

export function getWorkspaceRoleLabel(role) {
  switch (role) {
    case "admin":
      return "Workspace Admin";
    case "advancement_admin":
      return "Advancement Services Admin";
    case "reviewer":
      return "Advancement Services";
    case "executive_admin":
      return "Executive Admin";
    case "mgo":
      return "MGO";
    default:
      return role || "User";
  }
}
