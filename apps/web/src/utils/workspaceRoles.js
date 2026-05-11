export function isAdminRole(role) {
  return role === "admin";
}

export function isExecutiveAdminRole(role) {
  return role === "executive_admin";
}

export function canUseExecutiveViewRole(role) {
  return isAdminRole(role) || isExecutiveAdminRole(role);
}

export function isReviewerRole(role) {
  return role === "reviewer" || role === "admin";
}

export function isMgoRole(role) {
  return role === "mgo";
}

export function isAssignableRole(role) {
  return role === "mgo" || role === "reviewer" || role === "executive_admin";
}
