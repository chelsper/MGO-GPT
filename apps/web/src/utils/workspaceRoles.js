export function isAdminRole(role) {
  return role === "admin";
}

export function isReviewerRole(role) {
  return role === "reviewer" || role === "admin";
}

export function isMgoRole(role) {
  return role === "mgo";
}

export function isAssignableRole(role) {
  return role === "mgo" || role === "reviewer";
}
